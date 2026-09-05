from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.models import Account, DeliveryLog, Schedule
from app.db.repository import claim_schedule, due_schedule_ids
from app.db.session import SessionLocal
from app.services.autoclick import enabled_autoclick_account_ids, run_autoclick_worker
from app.services.scheduling import calculate_next_run
from app.userbot import user_client_manager

logger = logging.getLogger(__name__)

AUTOCLICK_RECONCILE_SECONDS = 1.0


async def process_schedule(schedule_id: int) -> None:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    lease_until = now + timedelta(seconds=max(settings.scheduler_poll_seconds * 3, 10))

    async with SessionLocal() as db:
        if not await claim_schedule(db, schedule_id, lease_until):
            return

    async with SessionLocal() as db:
        result = await db.execute(
            select(Schedule)
            .options(joinedload(Schedule.destination))
            .where(Schedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            return
        account = await db.get(Account, schedule.account_id)
        destination = schedule.destination

        if not account or not account.is_connected or not destination or not destination.enabled:
            schedule.enabled = False
            db.add(
                DeliveryLog(
                    schedule_id=schedule.id,
                    destination_id=schedule.destination_id,
                    ok=False,
                    error="Account or destination unavailable",
                )
            )
            await db.commit()
            return

        start = time.perf_counter()
        try:
            msg = await user_client_manager.send(
                account.id,
                account.session_name,
                destination.telegram_peer_id,
                schedule.payload,
            )
            schedule.last_run_at = now
            if schedule.schedule_type == "once":
                schedule.enabled = False
                schedule.next_run_at = None
            else:
                schedule.next_run_at = calculate_next_run(
                    schedule, now, settings.timezone
                )

            duration_ms = int((time.perf_counter() - start) * 1000)
            db.add(
                DeliveryLog(
                    schedule_id=schedule.id,
                    destination_id=schedule.destination_id,
                    ok=True,
                    telegram_message_id=getattr(msg, "id", None),
                    duration_ms=duration_ms,
                )
            )
            await db.commit()
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception("Schedule %s failed", schedule.id)
            schedule.next_run_at = now + timedelta(
                seconds=settings.scheduler_retry_delay_seconds
            )
            db.add(
                DeliveryLog(
                    schedule_id=schedule.id,
                    destination_id=schedule.destination_id,
                    ok=False,
                    error=str(exc)[:4000],
                    duration_ms=duration_ms,
                )
            )
            await db.commit()


async def run_once() -> None:
    settings = get_settings()
    ids = await _get_due_ids(settings.scheduler_batch_size)
    await asyncio.gather(*(process_schedule(schedule_id) for schedule_id in ids))


async def _get_due_ids(limit: int) -> list[int]:
    async with SessionLocal() as db:
        return await due_schedule_ids(db, limit=limit)


async def _reconcile_autoclick_workers(
    workers: dict[int, asyncio.Task[None]],
) -> None:
    desired = await enabled_autoclick_account_ids()

    for account_id in list(workers):
        task = workers[account_id]
        if account_id not in desired or task.done():
            if not task.done():
                task.cancel()
            workers.pop(account_id, None)

    for account_id in desired:
        if account_id in workers:
            continue
        workers[account_id] = asyncio.create_task(
            run_autoclick_worker(account_id),
            name=f"autoclick-{account_id}",
        )
        logger.info("AutoClick worker scheduled account_id=%s", account_id)


async def _wait_and_reap_workers(workers: dict[int, asyncio.Task[None]]) -> None:
    done_accounts = [account_id for account_id, task in workers.items() if task.done()]
    for account_id in done_accounts:
        task = workers.pop(account_id)
        try:
            task.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("AutoClick worker crashed account_id=%s", account_id)


async def loop() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    logger.info("Kronos Self Scheduler started")

    autoclick_workers: dict[int, asyncio.Task[None]] = {}
    try:
        last_autoclick_reconcile = 0.0

        while True:
            try:
                await run_once()
                now_mono = time.monotonic()
                if now_mono - last_autoclick_reconcile >= AUTOCLICK_RECONCILE_SECONDS:
                    await _reconcile_autoclick_workers(autoclick_workers)
                    last_autoclick_reconcile = now_mono
                await _wait_and_reap_workers(autoclick_workers)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Scheduler loop error")

            await asyncio.sleep(min(max(settings.scheduler_poll_seconds, 0.5), 2.0))
    finally:
        for task in autoclick_workers.values():
            task.cancel()
        if autoclick_workers:
            await asyncio.gather(*autoclick_workers.values(), return_exceptions=True)
        await user_client_manager.disconnect_all()

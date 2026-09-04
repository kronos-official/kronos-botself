from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Account, Schedule


async def get_or_create_account(session: AsyncSession, owner_id: int, session_name: str) -> Account:
    result = await session.execute(
        select(Account).where(Account.owner_telegram_id == owner_id)
    )
    account = result.scalar_one_or_none()
    if account:
        return account
    account = Account(owner_telegram_id=owner_id, session_name=session_name)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def get_account(session: AsyncSession, owner_id: int) -> Account | None:
    result = await session.execute(
        select(Account).where(Account.owner_telegram_id == owner_id)
    )
    return result.scalar_one_or_none()


async def due_schedule_ids(session: AsyncSession, limit: int = 25) -> list[int]:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(Schedule.id)
        .where(
            Schedule.enabled.is_(True),
            Schedule.next_run_at.is_not(None),
            Schedule.next_run_at <= now,
        )
        .order_by(Schedule.next_run_at.asc())
        .limit(limit)
    )
    return [row[0] for row in result.all()]


async def claim_schedule(
    session: AsyncSession,
    schedule_id: int,
    lease_until: datetime,
) -> bool:
    result = await session.execute(
        update(Schedule)
        .where(
            Schedule.id == schedule_id,
            Schedule.enabled.is_(True),
            Schedule.next_run_at.is_not(None),
            Schedule.next_run_at <= datetime.now(timezone.utc),
        )
        .values(next_run_at=lease_until)
    )
    await session.commit()
    return result.rowcount == 1

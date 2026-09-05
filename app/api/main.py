from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import (
    TelegramWebAppAuthError,
    validate_telegram_webapp_init_data,
)
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.models import (
    Account,
    DeliveryLog,
    Destination,
    Schedule,
    SupportTicket,
    SupportTicketMessage,
)
from app.db.session import SessionLocal, engine
from app.services.scheduling import calculate_next_run
from app.services.support import (
    CATEGORIES,
    PRIORITIES,
    STATUSES,
    active_ticket_count,
    add_event,
    new_public_id,
    ticket_to_dict,
)
from app.userbot import user_client_manager


settings = get_settings()
setup_logging(settings.log_level)

app = FastAPI(
    title="Kronos Self API",
    version="1.4.0",
    docs_url="/docs" if settings.log_level.upper() == "DEBUG" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.webapp_origin] if settings.webapp_origin else [],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

BASE_DIR = Path(__file__).resolve().parents[2]
MINIAPP_DIR = BASE_DIR / "miniapp"

app.mount(
    "/miniapp",
    StaticFiles(
        directory=str(MINIAPP_DIR),
        html=True,
    ),
    name="miniapp",
)


@app.middleware("http")
async def disable_miniapp_cache(request, call_next):
    response = await call_next(request)

    if request.url.path.startswith("/miniapp"):
        response.headers["Cache-Control"] = (
            "no-store, no-cache, must-revalidate, max-age=0"
        )
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response


def redis_client():
    import redis.asyncio as redis

    return redis.from_url(
        settings.redis_url,
        decode_responses=True,
    )


async def db():
    async with SessionLocal() as session:
        yield session


async def require_user(
    authorization: str | None = Header(default=None),
) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
        )

    token = authorization[7:].strip()

    if not token or len(token) > 256:
        raise HTTPException(
            status_code=401,
            detail="Invalid session",
        )

    redis = redis_client()

    try:
        telegram_user_id = await redis.get(
            f"ks:token:{token}"
        )
    finally:
        await redis.aclose()

    if not telegram_user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session",
        )

    try:
        return int(telegram_user_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid session",
        ) from exc


async def get_user_account(
    telegram_user_id: int,
    session: AsyncSession,
) -> Account | None:
    result = await session.execute(
        select(Account).where(
            Account.owner_telegram_id == telegram_user_id
        )
    )

    return result.scalar_one_or_none()


class WebAppAuth(BaseModel):
    init_data: str = Field(
        min_length=1,
        max_length=10000,
    )


class ScheduleCreate(BaseModel):
    destination_id: int
    content_type: str
    payload: dict = Field(default_factory=dict)
    schedule_type: str
    first_run_at: datetime | None = None
    interval_seconds: int | None = Field(
        default=None,
        ge=60,
        le=2_592_000,
    )
    weekday: int | None = Field(
        default=None,
        ge=0,
        le=6,
    )
    run_time: str | None = None

    @field_validator("content_type")
    @classmethod
    def valid_content(cls, value: str) -> str:
        allowed = {
            "text",
            "photo",
            "video",
            "gif",
            "document",
        }

        if value not in allowed:
            raise ValueError("Invalid content type")

        return value

    @field_validator("schedule_type")
    @classmethod
    def valid_schedule(cls, value: str) -> str:
        allowed = {
            "once",
            "daily",
            "weekly",
            "interval",
        }

        if value not in allowed:
            raise ValueError("Invalid schedule type")

        return value

    @field_validator("run_time")
    @classmethod
    def valid_run_time(cls, value: str | None) -> str | None:
        if value is None:
            return None

        parts = value.split(":")

        if len(parts) != 2:
            raise ValueError("run_time must use HH:MM")

        try:
            hour, minute = (
                int(part)
                for part in parts
            )
        except ValueError as exc:
            raise ValueError("run_time must use HH:MM") from exc

        if not (
            0 <= hour <= 23
            and 0 <= minute <= 59
        ):
            raise ValueError("run_time must use HH:MM")

        return f"{hour:02d}:{minute:02d}"


class SupportTicketCreate(BaseModel):
    subject: str = Field(
        min_length=3,
        max_length=200,
    )
    category: str = "technical"
    priority: str = "normal"
    body: str = Field(
        default="",
        max_length=5000,
    )
    attachments: list[dict] = Field(
        default_factory=list,
        max_length=5,
    )


class SupportReply(BaseModel):
    body: str = Field(
        default="",
        max_length=5000,
    )
    attachments: list[dict] = Field(
        default_factory=list,
        max_length=5,
    )


class SupportStatus(BaseModel):
    status: str
    note: str | None = Field(
        default=None,
        max_length=1000,
    )


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "version": "1.4.0",
    }


@app.get("/health/ready")
async def ready() -> dict:
    checks = {
        "database": False,
        "redis": False,
    }

    try:
        async with engine.connect() as connection:
            await connection.execute(
                text("SELECT 1")
            )

        checks["database"] = True
    except Exception:
        pass

    redis = redis_client()

    try:
        checks["redis"] = bool(
            await redis.ping()
        )
    except Exception:
        pass
    finally:
        await redis.aclose()

    if not all(checks.values()):
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "checks": checks,
            },
        )

    return {
        "ok": True,
        "checks": checks,
    }


@app.on_event("shutdown")
async def shutdown() -> None:
    await user_client_manager.disconnect_all()
    await engine.dispose()


@app.post("/api/webapp/session")
async def webapp_session(
    body: WebAppAuth,
) -> dict:
    try:
        user = validate_telegram_webapp_init_data(
            body.init_data
        )
    except (
        TelegramWebAppAuthError,
        ValueError,
        KeyError,
        TypeError,
        json.JSONDecodeError,
    ) as exc:
        raise HTTPException(
            status_code=401,
            detail=str(exc),
        ) from exc

    token = secrets.token_urlsafe(32)

    redis = redis_client()

    try:
        await redis.setex(
            f"ks:token:{token}",
            settings.access_token_ttl,
            str(user["id"]),
        )
    finally:
        await redis.aclose()

    return {
        "ok": True,
        "token": token,
        "expires_in": settings.access_token_ttl,
        "user": user,
    }


@app.get("/api/account")
async def account_info(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        return {
            "connected": False,
            "telegram_user_id": None,
            "phone_hint": None,
        }

    return {
        "connected": bool(account.is_connected),
        "telegram_user_id": account.telegram_user_id,
        "phone_hint": account.phone_hint,
    }


@app.post("/api/dialogs/sync")
async def sync_dialogs(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account or not account.is_connected:
        raise HTTPException(
            status_code=409,
            detail="Account is not connected",
        )

    try:
        items = await user_client_manager.sync_dialogs(
            account.id,
            account.session_name,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Telegram sync failed: {exc}",
        ) from exc

    for item in items:
        result = await session.execute(
            select(Destination).where(
                Destination.account_id == account.id,
                Destination.telegram_peer_id == item["peer_id"],
            )
        )

        existing = result.scalar_one_or_none()

        if existing:
            existing.title = item["title"]
            existing.username = item.get("username")
            existing.kind = item.get("kind", "other")
            existing.enabled = True
        else:
            session.add(
                Destination(
                    account_id=account.id,
                    telegram_peer_id=item["peer_id"],
                    title=item["title"],
                    username=item.get("username"),
                    kind=item.get("kind", "other"),
                    enabled=True,
                )
            )

    await session.commit()

    return {
        "items": items,
    }


@app.get("/api/destinations")
async def get_destinations(
    kind: str | None = None,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    allowed = {
        "channel",
        "group",
        "pm",
        "bot",
    }

    if kind is not None and kind not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Invalid destination kind",
        )

    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        return {
            "items": [],
            "kind": kind,
        }

    query = (
        select(Destination)
        .where(
            Destination.account_id == account.id,
            Destination.enabled.is_(True),
            Destination.kind.in_(allowed),
        )
        .order_by(
            Destination.title.asc()
        )
    )

    if kind:
        query = query.where(
            Destination.kind == kind
        )

    result = await session.execute(query)

    items = [
        {
            "id": item.id,
            "peer_id": item.telegram_peer_id,
            "title": item.title,
            "username": item.username,
            "kind": item.kind,
            "enabled": item.enabled,
        }
        for item in result.scalars().all()
    ]

    return {
        "items": items,
        "kind": kind,
    }


@app.get("/api/destinations/summary")
async def destinations_summary(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        return {
            "counts": {
                "pm": 0,
                "group": 0,
                "bot": 0,
                "channel": 0,
            }
        }

    result = await session.execute(
        select(
            Destination.kind,
            func.count(Destination.id),
        )
        .where(
            Destination.account_id == account.id,
            Destination.enabled.is_(True),
        )
        .group_by(
            Destination.kind
        )
    )

    counts = {
        kind: int(count)
        for kind, count in result.all()
    }

    return {
        "counts": {
            "pm": counts.get("pm", 0),
            "group": counts.get("group", 0),
            "bot": counts.get("bot", 0),
            "channel": counts.get("channel", 0),
        }
    }


@app.post("/api/media")
async def upload_media(
    file: UploadFile = File(...),
    telegram_user_id: int = Depends(require_user),
) -> dict:
    allowed = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "application/pdf",
        "application/zip",
        "application/octet-stream",
    }

    if file.content_type not in allowed:
        raise HTTPException(
            status_code=415,
            detail="Unsupported media type",
        )

    filename = Path(
        file.filename or "file.bin"
    ).name

    suffix = (
        Path(filename)
        .suffix
        .lower()[:10]
        or ".bin"
    )

    user_media_root = (
        Path(settings.media_dir).resolve()
        / str(telegram_user_id)
    )

    user_media_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    target = (
        user_media_root
        / f"{uuid4().hex}{suffix}"
    )

    total = 0
    max_bytes = (
        settings.upload_max_mb
        * 1024
        * 1024
    )

    try:
        with target.open("wb") as output:
            while chunk := await file.read(
                1024 * 1024
            ):
                total += len(chunk)

                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "File too large "
                            f"(max {settings.upload_max_mb}MB)"
                        ),
                    )

                output.write(chunk)

    except Exception:
        target.unlink(
            missing_ok=True
        )
        raise
    finally:
        await file.close()

    return {
        "path": str(target),
        "name": filename,
        "size": total,
        "content_type": file.content_type,
    }


def normalize_datetime(
    value: datetime | None,
) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


def valid_media_path(
    raw: str,
    telegram_user_id: int,
) -> str:
    root = (
        Path(settings.media_dir)
        .resolve()
        / str(telegram_user_id)
    )

    candidate = Path(raw).resolve()

    if (
        candidate != root
        and root not in candidate.parents
    ):
        raise HTTPException(
            status_code=422,
            detail="Invalid media file",
        )

    if not candidate.is_file():
        raise HTTPException(
            status_code=422,
            detail="Media file does not exist",
        )

    return str(candidate)


def serialize_schedule(
    schedule: Schedule,
    destination: Destination | None = None,
) -> dict:
    return {
        "id": schedule.id,
        "destination_id": schedule.destination_id,
        "destination_title": (
            destination.title
            if destination
            else None
        ),
        "content_type": schedule.content_type,
        "schedule_type": schedule.schedule_type,
        "interval_seconds": schedule.interval_seconds,
        "weekday": schedule.weekday,
        "run_time": schedule.run_time,
        "next_run_at": schedule.next_run_at,
        "last_run_at": schedule.last_run_at,
        "enabled": schedule.enabled,
        "payload": {
            key: value
            for key, value in (
                schedule.payload or {}
            ).items()
            if key != "file_path"
        },
        "created_at": schedule.created_at,
    }


@app.post("/api/schedules")
async def create_schedule(
    body: ScheduleCreate,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account or not account.is_connected:
        raise HTTPException(
            status_code=409,
            detail="Account is not connected",
        )

    destination = await session.get(
        Destination,
        body.destination_id,
    )

    if (
        not destination
        or destination.account_id != account.id
        or not destination.enabled
    ):
        raise HTTPException(
            status_code=404,
            detail="Destination not found",
        )

    payload = dict(body.payload)
    payload["type"] = body.content_type

    if body.content_type == "text":
        text_value = str(
            payload.get(
                "text",
                "",
            )
        ).strip()

        if not text_value:
            raise HTTPException(
                status_code=422,
                detail="Text is empty",
            )

        if len(text_value) > 4096:
            raise HTTPException(
                status_code=422,
                detail="Text exceeds Telegram limit",
            )

        payload["text"] = text_value

    else:
        file_path = payload.get(
            "file_path"
        )

        if not file_path:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Media schedule requires file_path"
                ),
            )

        payload["file_path"] = valid_media_path(
            str(file_path),
            telegram_user_id,
        )

    if (
        body.schedule_type == "interval"
        and body.interval_seconds is None
    ):
        raise HTTPException(
            status_code=422,
            detail="interval_seconds is required",
        )

    if (
        body.schedule_type == "weekly"
        and body.weekday is None
    ):
        raise HTTPException(
            status_code=422,
            detail="weekday is required",
        )

    if (
        body.schedule_type in {"daily", "weekly"}
        and body.run_time is None
    ):
        raise HTTPException(
            status_code=422,
            detail="run_time is required",
        )

    now = datetime.now(
        timezone.utc
    )

    first_run = normalize_datetime(
        body.first_run_at
    )

    schedule = Schedule(
        account_id=account.id,
        destination_id=destination.id,
        content_type=body.content_type,
        payload=payload,
        schedule_type=body.schedule_type,
        interval_seconds=body.interval_seconds,
        weekday=body.weekday,
        run_time=body.run_time,
        next_run_at=first_run or now,
        enabled=True,
    )

    if (
        body.schedule_type
        in {"daily", "weekly", "interval"}
        and first_run is None
    ):
        schedule.next_run_at = calculate_next_run(
            schedule,
            now - timedelta(seconds=1),
            settings.timezone,
        )

    session.add(schedule)

    await session.commit()
    await session.refresh(schedule)

    return serialize_schedule(
        schedule,
        destination,
    )


@app.get("/api/schedules")
async def list_schedules(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        return {
            "items": [],
        }

    result = await session.execute(
        select(
            Schedule,
            Destination,
        )
        .join(
            Destination,
            Destination.id
            == Schedule.destination_id,
        )
        .where(
            Schedule.account_id
            == account.id
        )
        .order_by(
            Schedule.id.desc()
        )
    )

    return {
        "items": [
            serialize_schedule(
                schedule,
                destination,
            )
            for schedule, destination
            in result.all()
        ]
    }


@app.patch("/api/schedules/{schedule_id}/pause")
async def pause_schedule(
    schedule_id: int,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    schedule = (
        await session.execute(
            select(Schedule).where(
                Schedule.id == schedule_id,
                Schedule.account_id == account.id,
            )
        )
    ).scalar_one_or_none()

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    schedule.enabled = False

    await session.commit()

    return {
        "ok": True,
        "enabled": False,
    }


@app.patch("/api/schedules/{schedule_id}/resume")
async def resume_schedule(
    schedule_id: int,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    schedule = (
        await session.execute(
            select(Schedule).where(
                Schedule.id == schedule_id,
                Schedule.account_id == account.id,
            )
        )
    ).scalar_one_or_none()

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    schedule.enabled = True

    if schedule.next_run_at is None:
        now = datetime.now(
            timezone.utc
        )

        schedule.next_run_at = (
            calculate_next_run(
                schedule,
                now - timedelta(seconds=1),
                settings.timezone,
            )
            or now
        )

    await session.commit()

    return {
        "ok": True,
        "enabled": True,
        "next_run_at": schedule.next_run_at,
    }


@app.delete("/api/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    schedule = (
        await session.execute(
            select(Schedule).where(
                Schedule.id == schedule_id,
                Schedule.account_id == account.id,
            )
        )
    ).scalar_one_or_none()

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    await session.delete(schedule)
    await session.commit()

    return {
        "ok": True,
    }


@app.get("/api/logs")
async def logs(
    limit: int = 100,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    limit = max(
        1,
        min(limit, 500),
    )

    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        return {
            "items": [],
        }

    result = await session.execute(
        select(
            DeliveryLog,
            Schedule,
            Destination,
        )
        .join(
            Schedule,
            Schedule.id
            == DeliveryLog.schedule_id,
        )
        .join(
            Destination,
            Destination.id
            == DeliveryLog.destination_id,
        )
        .where(
            Schedule.account_id
            == account.id
        )
        .order_by(
            DeliveryLog.id.desc()
        )
        .limit(limit)
    )

    return {
        "items": [
            {
                "id": log.id,
                "schedule_id": log.schedule_id,
                "destination": destination.title,
                "ok": log.ok,
                "telegram_message_id": (
                    log.telegram_message_id
                ),
                "error": log.error,
                "duration_ms": log.duration_ms,
                "created_at": log.created_at,
                "content_type": schedule.content_type,
            }
            for (
                log,
                schedule,
                destination,
            ) in result.all()
        ]
    }


@app.get("/api/support/tickets")
async def support_list_tickets(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    result = await session.execute(
        select(SupportTicket)
        .where(
            SupportTicket.requester_telegram_id
            == telegram_user_id
        )
        .order_by(
            SupportTicket.updated_at.desc()
        )
    )

    tickets = result.scalars().all()

    return {
        "items": [
            ticket_to_dict(ticket)
            for ticket in tickets
        ]
    }


@app.get("/api/support/tickets/{public_id}")
async def support_get_ticket(
    public_id: str,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    ticket = (
        await session.execute(
            select(SupportTicket).where(
                SupportTicket.public_id
                == public_id,
                SupportTicket.requester_telegram_id
                == telegram_user_id,
            )
        )
    ).scalar_one_or_none()

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    messages = (
        await session.execute(
            select(SupportTicketMessage)
            .where(
                SupportTicketMessage.ticket_id
                == ticket.id
            )
            .order_by(
                SupportTicketMessage.id.asc()
            )
        )
    ).scalars().all()

    return ticket_to_dict(
        ticket,
        messages,
    )


@app.post("/api/support/tickets")
async def support_create_ticket(
    body: SupportTicketCreate,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    if body.category not in CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail="Invalid ticket category",
        )

    if body.priority not in PRIORITIES:
        raise HTTPException(
            status_code=422,
            detail="Invalid ticket priority",
        )

    if (
        not body.body.strip()
        and not body.attachments
    ):
        raise HTTPException(
            status_code=422,
            detail="Ticket message cannot be empty",
        )

    if (
        await active_ticket_count(
            session,
            telegram_user_id,
        )
        >= settings.support_max_active_tickets
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "You have reached "
                "the active ticket limit"
            ),
        )

    ticket = SupportTicket(
        public_id=new_public_id(),
        requester_telegram_id=telegram_user_id,
        subject=body.subject.strip(),
        category=body.category,
        priority=body.priority,
        status="open",
    )

    session.add(ticket)
    await session.flush()

    session.add(
        SupportTicketMessage(
            ticket_id=ticket.id,
            author_telegram_id=telegram_user_id,
            author_role="user",
            body=body.body.strip(),
            attachments=body.attachments,
        )
    )

    await add_event(
        session,
        ticket.id,
        telegram_user_id,
        "created",
        to_status="open",
        note="Ticket created from Kronos Self Mini App",
    )

    await session.commit()
    await session.refresh(ticket)

    target = (
        settings.support_telegram_id
        or settings.owner_telegram_id
    )

    try:
        from aiogram import Bot

        bot = Bot(
            token=settings.bot_token
        )

        message_text = (
            "🎫 <b>تیکت جدید Kronos Self</b>\n\n"
            f"<b>شناسه:</b> "
            f"<code>{ticket.public_id}</code>\n"
            f"<b>کاربر:</b> "
            f"<code>{telegram_user_id}</code>\n"
            f"<b>موضوع:</b> "
            f"{body.subject.strip()}\n"
            f"<b>دسته:</b> "
            f"{CATEGORIES[body.category]}\n"
            f"<b>اولویت:</b> "
            f"{PRIORITIES[body.priority]}\n\n"
            f"{body.body.strip() or '📎 دارای پیوست'}"
        )

        await bot.send_message(
            target,
            message_text,
        )

        await bot.session.close()

    except Exception:
        pass

    return ticket_to_dict(ticket)


@app.post("/api/support/tickets/{public_id}/reply")
async def support_reply(
    public_id: str,
    body: SupportReply,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    ticket = (
        await session.execute(
            select(SupportTicket).where(
                SupportTicket.public_id
                == public_id,
                SupportTicket.requester_telegram_id
                == telegram_user_id,
            )
        )
    ).scalar_one_or_none()

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    if ticket.status == "closed":
        raise HTTPException(
            status_code=409,
            detail=(
                "This ticket is closed "
                "and cannot receive new messages"
            ),
        )

    if (
        not body.body.strip()
        and not body.attachments
    ):
        raise HTTPException(
            status_code=422,
            detail="Reply cannot be empty",
        )

    previous = ticket.status

    session.add(
        SupportTicketMessage(
            ticket_id=ticket.id,
            author_telegram_id=telegram_user_id,
            author_role="user",
            body=body.body.strip(),
            attachments=body.attachments,
        )
    )

    ticket.status = "open"
    ticket.closed_at = None

    await session.flush()

    await add_event(
        session,
        ticket.id,
        telegram_user_id,
        "replied",
        from_status=previous,
        to_status="open",
    )

    await session.commit()

    messages = (
        await session.execute(
            select(SupportTicketMessage)
            .where(
                SupportTicketMessage.ticket_id
                == ticket.id
            )
            .order_by(
                SupportTicketMessage.id.asc()
            )
        )
    ).scalars().all()

    return ticket_to_dict(
        ticket,
        messages,
    )


@app.patch("/api/support/tickets/{public_id}/status")
async def support_status(
    public_id: str,
    body: SupportStatus,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    if body.status not in STATUSES:
        raise HTTPException(
            status_code=422,
            detail="Invalid ticket status",
        )

    ticket = (
        await session.execute(
            select(SupportTicket).where(
                SupportTicket.public_id
                == public_id,
                SupportTicket.requester_telegram_id
                == telegram_user_id,
            )
        )
    ).scalar_one_or_none()

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    if (
        ticket.status == "closed"
        and body.status != "closed"
    ):
        raise HTTPException(
            status_code=409,
            detail="Closed tickets cannot be reopened",
        )

    if body.status != "closed":
        raise HTTPException(
            status_code=403,
            detail=(
                "Only closing your own ticket "
                "is allowed"
            ),
        )

    previous = ticket.status

    ticket.status = "closed"
    ticket.closed_at = datetime.now(
        timezone.utc
    )

    await session.flush()

    await add_event(
        session,
        ticket.id,
        telegram_user_id,
        "closed",
        from_status=previous,
        to_status="closed",
        note=body.note,
    )

    await session.commit()

    return ticket_to_dict(ticket)

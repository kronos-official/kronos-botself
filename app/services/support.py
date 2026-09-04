from __future__ import annotations

from datetime import datetime, timezone
from secrets import token_hex
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import SupportTicket, SupportTicketEvent, SupportTicketMessage

CATEGORIES = {
    "technical": "فنی",
    "moderation": "مدیریت و عملکرد",
    "payment": "پرداخت",
    "account": "اکانت و ورود",
    "suggestion": "پیشنهاد",
    "other": "سایر",
}
PRIORITIES = {"low": "کم", "normal": "عادی", "high": "زیاد", "urgent": "فوری"}
STATUSES = {
    "open": "باز",
    "in_progress": "در حال بررسی",
    "waiting_user": "در انتظار پاسخ شما",
    "resolved": "حل‌شده",
    "closed": "بسته‌شده",
}
ACTIVE_STATUSES = {"open", "in_progress", "waiting_user"}


def new_public_id() -> str:
    return f"KS-T-{token_hex(5).upper()}"


def can_change_status(current: str, new: str, actor_is_owner: bool) -> bool:
    if current == "closed":
        return False
    return actor_is_owner or new == "closed"


def is_active(status: str) -> bool:
    return status in ACTIVE_STATUSES


async def active_ticket_count(db: AsyncSession, requester_id: int) -> int:
    result = await db.execute(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.requester_telegram_id == requester_id,
            SupportTicket.status.in_(ACTIVE_STATUSES),
        )
    )
    return int(result.scalar_one() or 0)


async def add_event(db: AsyncSession, ticket_id: int, actor: int, event_type: str, *, from_status: str | None = None, to_status: str | None = None, note: str | None = None) -> None:
    db.add(SupportTicketEvent(ticket_id=ticket_id, actor_telegram_id=actor, event_type=event_type, from_status=from_status, to_status=to_status, note=note))


def ticket_to_dict(ticket: SupportTicket, messages: list[SupportTicketMessage] | None = None) -> dict:
    return {
        "id": ticket.id,
        "public_id": ticket.public_id,
        "requester_telegram_id": ticket.requester_telegram_id,
        "subject": ticket.subject,
        "category": ticket.category,
        "category_label": CATEGORIES.get(ticket.category, ticket.category),
        "priority": ticket.priority,
        "priority_label": PRIORITIES.get(ticket.priority, ticket.priority),
        "status": ticket.status,
        "status_label": STATUSES.get(ticket.status, ticket.status),
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "closed_at": ticket.closed_at,
        "messages": [message_to_dict(m) for m in (messages or [])],
    }


def message_to_dict(message: SupportTicketMessage) -> dict:
    return {
        "id": message.id,
        "author_telegram_id": message.author_telegram_id,
        "author_role": message.author_role,
        "body": message.body,
        "attachments": message.attachments or [],
        "created_at": message.created_at,
    }

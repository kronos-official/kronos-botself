from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.db.models import Schedule

UTC = timezone.utc


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _parse_time(value: str | None) -> tuple[int, int]:
    raw = value or "09:00"
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("run_time must use HH:MM format")
    hour, minute = (int(x) for x in parts)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("run_time must use HH:MM format")
    return hour, minute


def calculate_next_run(
    schedule: Schedule,
    now: datetime,
    timezone_name: str,
) -> datetime | None:
    tz = ZoneInfo(timezone_name)
    now_utc = _as_utc(now)
    local_now = now_utc.astimezone(tz)
    kind = schedule.schedule_type

    if kind == "once":
        return None

    if kind == "interval":
        seconds = max(schedule.interval_seconds or 3600, 60)
        return now_utc + timedelta(seconds=seconds)

    hour, minute = _parse_time(schedule.run_time)
    candidate = local_now.replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )

    if kind == "daily":
        if candidate <= local_now:
            candidate += timedelta(days=1)
    elif kind == "weekly":
        target = int(schedule.weekday if schedule.weekday is not None else 0)
        if not 0 <= target <= 6:
            raise ValueError("weekday must be between 0 and 6")
        days = (target - local_now.weekday()) % 7
        candidate += timedelta(days=days)
        if candidate <= local_now:
            candidate += timedelta(days=7)
    else:
        return None

    return candidate.astimezone(UTC)

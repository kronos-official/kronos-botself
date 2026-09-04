from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.scheduling import calculate_next_run


def schedule(**kwargs):
    defaults = {
        "schedule_type": "interval",
        "interval_seconds": 3600,
        "weekday": None,
        "run_time": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_interval_is_in_future():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = calculate_next_run(schedule(), now, "Asia/Tehran")
    assert result == datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc)


def test_daily_schedule():
    now = datetime(2026, 1, 1, 5, 0, tzinfo=timezone.utc)  # 08:30 Tehran
    result = calculate_next_run(
        schedule(schedule_type="daily", run_time="09:00"), now, "Asia/Tehran"
    )
    assert result == datetime(2026, 1, 1, 5, 30, tzinfo=timezone.utc)


def test_once_schedule_has_no_next_run():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert calculate_next_run(schedule(schedule_type="once"), now, "Asia/Tehran") is None

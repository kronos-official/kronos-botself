from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

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


def test_interval_is_clamped_to_minimum_60_seconds():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = calculate_next_run(
        schedule(interval_seconds=1),
        now,
        "Asia/Tehran",
    )
    assert result == datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc)


def test_daily_schedule():
    now = datetime(2026, 1, 1, 5, 0, tzinfo=timezone.utc)  # 08:30 Tehran
    result = calculate_next_run(
        schedule(schedule_type="daily", run_time="09:00"), now, "Asia/Tehran"
    )
    assert result == datetime(2026, 1, 1, 5, 30, tzinfo=timezone.utc)


def test_daily_schedule_rolls_to_next_day_after_run_time():
    now = datetime(2026, 1, 1, 7, 0, tzinfo=timezone.utc)  # 10:30 Tehran
    result = calculate_next_run(
        schedule(schedule_type="daily", run_time="09:00"), now, "Asia/Tehran"
    )
    assert result == datetime(2026, 1, 2, 5, 30, tzinfo=timezone.utc)


def test_weekly_schedule():
    now = datetime(2026, 1, 1, 5, 0, tzinfo=timezone.utc)  # Thursday 08:30 Tehran
    result = calculate_next_run(
        schedule(schedule_type="weekly", run_time="09:00", weekday=4),
        now,
        "Asia/Tehran",
    )
    assert result == datetime(2026, 1, 2, 5, 30, tzinfo=timezone.utc)


def test_once_schedule_has_no_next_run():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert calculate_next_run(schedule(schedule_type="once"), now, "Asia/Tehran") is None


def test_invalid_run_time_is_rejected():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="HH:MM"):
        calculate_next_run(
            schedule(schedule_type="daily", run_time="25:99"),
            now,
            "Asia/Tehran",
        )


def test_invalid_weekday_is_rejected():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="weekday"):
        calculate_next_run(
            schedule(schedule_type="weekly", run_time="09:00", weekday=7),
            now,
            "Asia/Tehran",
        )

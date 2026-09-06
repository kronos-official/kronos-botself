from __future__ import annotations

import asyncio


_locks: dict[int, asyncio.Lock] = {}


def account_lock(account_id: int) -> asyncio.Lock:
    """Return the process-local serialization lock for one Telegram account."""
    return _locks.setdefault(int(account_id), asyncio.Lock())

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from telethon.errors import FloodWaitError, RPCError

from app.db.models import Account, AutoClickSetting
from app.db.session import SessionLocal
from app.userbot import user_client_manager

logger = logging.getLogger(__name__)

AUTOCLICK_BOT_USERNAME = "MeowieQBot"
FISH_TRIGGER_TEXT = "ماهی"

ACTION_SELL = "فروش ماهی"
ACTION_FEED = "بده پیشی بخوره"
ACTION_FRIDGE = "بندازش توی یخچال"

ALLOWED_ACTIONS = {
    ACTION_SELL,
    ACTION_FEED,
    ACTION_FRIDGE,
}

MIN_INTERVAL_SECONDS = 1
MAX_INTERVAL_SECONDS = 86400
MENU_TIMEOUT_SECONDS = 20.0


class AutoClickError(RuntimeError):
    """Base error for the AutoClick subsystem."""


class AutoClickNotFound(AutoClickError):
    """Expected Telegram message/button was not found."""


class AutoClickButtonNotFound(AutoClickError):
    """Expected inline button was not found."""


class AutoClickUnauthorized(AutoClickError):
    """Telegram user session is not authorized."""


class AutoClickBusy(AutoClickError):
    """The same account is already executing an AutoClick job."""


@dataclass(slots=True)
class AutoClickResult:
    ok: bool
    group_id: int
    action: str
    trigger_message_id: int | None = None
    menu_message_id: int | None = None
    clicked_button: str | None = None
    elapsed_ms: int = 0


_locks: dict[int, asyncio.Lock] = {}


def _lock_for(account_id: int) -> asyncio.Lock:
    return _locks.setdefault(account_id, asyncio.Lock())


def normalize_button_text(value: str | None) -> str:
    if not value:
        return ""

    return (
        str(value)
        .replace("\u200c", "")
        .replace("\u200f", "")
        .replace("\u200e", "")
        .replace("\u2060", "")
        .replace("ي", "ی")
        .replace("ى", "ی")
        .replace("ك", "ک")
        .replace("ۀ", "ه")
        .replace("ة", "ه")
        .replace("ـ", "")
        .strip()
    )


def button_matches(actual: str | None, expected: str) -> bool:
    return normalize_button_text(actual) == normalize_button_text(expected)


async def _load_worker_state(account_id: int) -> tuple[Account | None, AutoClickSetting | None]:
    async with SessionLocal() as db:
        account = await db.get(Account, account_id)
        if not account:
            return None, None

        result = await db.execute(
            select(AutoClickSetting).where(
                AutoClickSetting.account_id == account_id
            )
        )
        setting = result.scalar_one_or_none()
        return account, setting


async def enabled_autoclick_account_ids() -> set[int]:
    async with SessionLocal() as db:
        result = await db.execute(
            select(AutoClickSetting.account_id)
            .join(Account, Account.id == AutoClickSetting.account_id)
            .where(
                AutoClickSetting.enabled.is_(True),
                AutoClickSetting.group_peer_id.is_not(None),
                Account.is_connected.is_(True),
            )
        )
        return {int(row[0]) for row in result.all()}


async def _find_meowie_menu(
    client: Any,
    group_id: int,
    bot_id: int,
    trigger_message_id: int,
    *,
    timeout: float = MENU_TIMEOUT_SECONDS,
):
    """Find the special bot menu only after a fresh «ماهی» message."""
    deadline = time.monotonic() + timeout
    expected_buttons = {normalize_button_text(action) for action in ALLOWED_ACTIONS}

    while time.monotonic() < deadline:
        try:
            messages = await client.get_messages(group_id, limit=60)
        except RPCError as exc:
            raise AutoClickError(
                f"خطای Telegram هنگام دریافت منوی اتوکلیک: {exc}"
            ) from exc

        candidates: list[tuple[int, Any]] = []

        for message in messages:
            if not message or message.id <= trigger_message_id:
                continue
            if not message.buttons:
                continue

            sender_id = getattr(message, "sender_id", None)
            via_bot_id = getattr(message, "via_bot_id", None)
            is_bot_message = sender_id == bot_id or via_bot_id == bot_id

            texts: list[str] = []
            for row in message.buttons:
                for button in row:
                    text = normalize_button_text(getattr(button, "text", None))
                    if text:
                        texts.append(text)

            has_expected_button = bool(expected_buttons.intersection(texts))
            if is_bot_message:
                candidates.append((0, message))
            elif has_expected_button:
                candidates.append((1, message))

        if candidates:
            candidates.sort(key=lambda item: (item[0], -int(item[1].id)))
            return candidates[0][1]

        await asyncio.sleep(0.35)

    raise AutoClickNotFound(
        "منوی @MeowieQBot بعد از ارسال «ماهی» پیدا نشد. "
        "ربات باید در گروه حاضر باشد و بتواند به «ماهی» پاسخ بدهد."
    )


async def _click_action(menu_message: Any, action: str) -> str:
    if action not in ALLOWED_ACTIONS:
        raise AutoClickError("عملیات اتوکلیک نامعتبر است.")

    if not menu_message.buttons:
        raise AutoClickButtonNotFound("پیام ربات هیچ Inline Keyboard ندارد.")

    expected = normalize_button_text(action)

    for row in menu_message.buttons:
        for button in row:
            actual = normalize_button_text(getattr(button, "text", None))
            if actual != expected:
                continue
            try:
                await button.click()
            except RPCError as exc:
                raise AutoClickError(
                    f"کلیک روی «{action}» توسط Telegram رد شد: {exc}"
                ) from exc
            return actual

    raise AutoClickButtonNotFound(
        f"دکمه «{action}» در منوی ربات پیدا نشد."
    )


async def execute_autoclick(
    *,
    account_id: int,
    session_name: str,
    group_id: int,
    action: str,
) -> AutoClickResult:
    """Run exactly one fish -> menu -> click cycle."""
    if action not in ALLOWED_ACTIONS:
        raise AutoClickError("عملیات اتوکلیک نامعتبر است.")

    lock = _lock_for(account_id)
    if lock.locked():
        raise AutoClickBusy(
            "برای این اکانت یک اجرای اتوکلیک دیگر در حال انجام است."
        )

    started = time.perf_counter()

    async with lock:
        try:
            client = await user_client_manager.connect(account_id, session_name)
            if not await client.is_user_authorized():
                raise AutoClickUnauthorized("اکانت Telegram مجاز نیست.")
        except AutoClickError:
            raise
        except RPCError as exc:
            raise AutoClickError(
                f"بررسی Session تلگرام ناموفق بود: {exc}"
            ) from exc
        except Exception as exc:
            raise AutoClickError(
                f"اتصال به Session تلگرام انجام نشد: {exc}"
            ) from exc

        try:
            bot = await client.get_entity(AUTOCLICK_BOT_USERNAME)
        except Exception as exc:
            raise AutoClickError(
                "ربات @MeowieQBot پیدا نشد یا قابل دسترسی نیست."
            ) from exc

        bot_id = int(bot.id)

        try:
            trigger = await client.send_message(group_id, FISH_TRIGGER_TEXT)
            menu = await _find_meowie_menu(
                client,
                group_id,
                bot_id,
                trigger.id,
            )
            clicked = await _click_action(menu, action)
        except FloodWaitError as exc:
            raise AutoClickError(
                f"Telegram موقتاً محدود کرده است؛ {exc.seconds} ثانیه صبر لازم است."
            ) from exc
        except AutoClickError:
            raise
        except RPCError as exc:
            raise AutoClickError(
                f"خطای Telegram در اجرای اتوکلیک: {exc}"
            ) from exc
        except Exception as exc:
            raise AutoClickError(
                f"اجرای یک چرخه اتوکلیک ناموفق بود: {exc}"
            ) from exc

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "AutoClick cycle succeeded account_id=%s group_id=%s action=%s menu_message_id=%s elapsed_ms=%s",
            account_id,
            group_id,
            action,
            menu.id,
            elapsed_ms,
        )

        return AutoClickResult(
            ok=True,
            group_id=group_id,
            action=action,
            trigger_message_id=trigger.id,
            menu_message_id=menu.id,
            clicked_button=clicked,
            elapsed_ms=elapsed_ms,
        )


async def run_autoclick_worker(account_id: int) -> None:
    """Persistent per-account worker. It resumes automatically while enabled."""
    logger.info("AutoClick worker started account_id=%s", account_id)

    try:
        next_send_at = time.monotonic()

        while True:
            account, setting = await _load_worker_state(account_id)

            if not account or not setting:
                return
            if not account.is_connected or not setting.enabled or not setting.group_peer_id:
                return

            interval = max(
                MIN_INTERVAL_SECONDS,
                min(int(setting.interval_seconds or 10), MAX_INTERVAL_SECONDS),
            )
            action = setting.selected_action
            group_id = int(setting.group_peer_id)

            if action not in ALLOWED_ACTIONS:
                logger.error(
                    "AutoClick worker stopping: invalid action account_id=%s action=%r",
                    account_id,
                    action,
                )
                return

            now = time.monotonic()
            if now < next_send_at:
                await asyncio.sleep(next_send_at - now)
                continue

            cycle_started = time.monotonic()
            try:
                await execute_autoclick(
                    account_id=account.id,
                    session_name=account.session_name,
                    group_id=group_id,
                    action=action,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception(
                    "AutoClick cycle failed account_id=%s group_id=%s: %s",
                    account_id,
                    group_id,
                    exc,
                )

            # The configured interval is the gap between fish messages,
            # not an extra delay stacked on top of menu-search/click time.
            next_send_at = cycle_started + interval
    finally:
        logger.info("AutoClick worker stopped account_id=%s", account_id)

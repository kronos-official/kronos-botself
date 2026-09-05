from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from telethon.errors import FloodWaitError, RPCError

logger = logging.getLogger(__name__)

AUTOCLICK_BOT_USERNAME = "MeowieQBot"

ACTION_SELL = "فروش ماهی"
ACTION_FEED = "بده پیشی بخوره"
ACTION_FRIDGE = "بندازش توی یخچال"

ALLOWED_ACTIONS = {
    ACTION_SELL,
    ACTION_FEED,
    ACTION_FRIDGE,
}


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


async def _find_meowie_menu(
    client: Any,
    group_id: int,
    bot_id: int,
    trigger_message_id: int,
    *,
    timeout: float = 20.0,
):
    """Find the bot's inline-keyboard response after the trigger message.

    Telegram can expose bot-originated messages through different fields
    depending on the chat/message shape. We therefore prefer sender/via-bot
    matches, but accept a post-trigger message containing the expected
    AutoClick buttons when the sender metadata is not directly available.
    """
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

        await asyncio.sleep(0.4)

    raise AutoClickNotFound(
        "منوی @MeowieQBot بعد از ارسال «ماهی» پیدا نشد. "
        "بررسی کنید ربات در گروه حضور داشته باشد و بتواند به پیام‌ها پاسخ دهد."
    )


async def _click_action(menu_message: Any, action: str) -> str:
    if action not in ALLOWED_ACTIONS:
        raise AutoClickError("عملیات اتوکلیک نامعتبر است.")

    if not menu_message.buttons:
        raise AutoClickButtonNotFound(
            "پیام ربات هیچ Inline Keyboard ندارد."
        )

    expected = normalize_button_text(action)

    for row in menu_message.buttons:
        for button in row:
            actual = normalize_button_text(getattr(button, "text", None))
            if actual == expected:
                try:
                    await button.click()
                except RPCError as exc:
                    raise AutoClickError(
                        f"کلیک روی «{action}» توسط Telegram رد شد: {exc}"
                    ) from exc
                return actual

    try:
        await menu_message.click(
            text=lambda text: normalize_button_text(text) == expected
        )
        return action
    except RPCError as exc:
        raise AutoClickError(
            f"کلیک روی «{action}» توسط Telegram رد شد: {exc}"
        ) from exc
    except Exception as exc:
        raise AutoClickButtonNotFound(
            f"دکمه «{action}» در منوی ربات پیدا نشد."
        ) from exc


async def execute_autoclick(
    *,
    account_id: int,
    session_name: str,
    group_id: int,
    action: str,
) -> AutoClickResult:
    if action not in ALLOWED_ACTIONS:
        raise AutoClickError("عملیات اتوکلیک نامعتبر است.")

    lock = _lock_for(account_id)
    if lock.locked():
        raise AutoClickBusy(
            "برای این اکانت یک اجرای اتوکلیک دیگر در حال انجام است."
        )

    from app.userbot import user_client_manager

    started = time.perf_counter()

    async with lock:
        try:
            client = await user_client_manager.connect(account_id, session_name)
        except Exception as exc:
            raise AutoClickError(
                f"اتصال به Session تلگرام انجام نشد: {exc}"
            ) from exc

        try:
            if not await client.is_user_authorized():
                raise AutoClickUnauthorized("اکانت Telegram مجاز نیست.")
        except RPCError as exc:
            raise AutoClickError(
                f"بررسی Session تلگرام ناموفق بود: {exc}"
            ) from exc

        try:
            bot = await client.get_entity(AUTOCLICK_BOT_USERNAME)
        except Exception as exc:
            raise AutoClickError(
                "ربات @MeowieQBot پیدا نشد یا قابل دسترسی نیست."
            ) from exc

        bot_id = int(bot.id)

        logger.info(
            "AutoClick started account_id=%s group_id=%s action=%s",
            account_id,
            group_id,
            action,
        )

        try:
            trigger = await client.send_message(group_id, "میو")
            await asyncio.sleep(0.45)

            menu_trigger = await client.send_message(group_id, "ماهی")

            menu = await _find_meowie_menu(
                client,
                group_id,
                bot_id,
                menu_trigger.id,
                timeout=20.0,
            )

            clicked = await _click_action(menu, action)
            elapsed_ms = int((time.perf_counter() - started) * 1000)

            logger.info(
                "AutoClick succeeded account_id=%s group_id=%s action=%s menu_message_id=%s elapsed_ms=%s",
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

        except FloodWaitError as exc:
            logger.exception(
                "AutoClick FloodWait account_id=%s group_id=%s wait=%s",
                account_id,
                group_id,
                exc.seconds,
            )
            raise AutoClickError(
                f"Telegram به‌صورت موقت محدود کرده است؛ {exc.seconds} ثانیه بعد دوباره تلاش کنید."
            ) from exc
        except RPCError as exc:
            logger.exception(
                "AutoClick Telegram RPC error account_id=%s group_id=%s",
                account_id,
                group_id,
            )
            raise AutoClickError(
                f"خطای Telegram در اجرای اتوکلیک: {exc}"
            ) from exc
        except AutoClickError:
            logger.exception(
                "AutoClick controlled failure account_id=%s group_id=%s action=%s",
                account_id,
                group_id,
                action,
            )
            raise
        except Exception as exc:
            logger.exception(
                "AutoClick failed account_id=%s group_id=%s action=%s",
                account_id,
                group_id,
                action,
            )
            raise AutoClickError(
                f"اجرای اتوکلیک ناموفق بود: {exc}"
            ) from exc

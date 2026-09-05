from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from telethon.errors import FloodWaitError, RPCError

from app.userbot import user_client_manager

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
        .replace("ي", "ی")
        .replace("ى", "ی")
        .replace("ك", "ک")
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
    timeout: float = 15.0,
):
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        messages = await client.get_messages(group_id, limit=40)
        fallback = None

        for message in messages:
            if not message:
                continue
            if message.id <= trigger_message_id:
                continue
            if message.sender_id != bot_id:
                continue
            if not message.buttons:
                continue

            reply_to = getattr(message, "reply_to_msg_id", None)
            if reply_to == trigger_message_id:
                return message
            if fallback is None:
                fallback = message

        if fallback is not None:
            return fallback

        await asyncio.sleep(0.35)

    raise AutoClickNotFound(
        "منوی @MeowieQBot بعد از ارسال «ماهی» پیدا نشد."
    )


async def _click_action(menu_message: Any, action: str) -> str:
    if action not in ALLOWED_ACTIONS:
        raise ValueError(f"Unsupported AutoClick action: {action}")

    if not menu_message.buttons:
        raise AutoClickButtonNotFound(
            "پیام ربات هیچ Inline Keyboard ندارد."
        )

    expected = normalize_button_text(action)

    for row in menu_message.buttons:
        for button in row:
            actual = normalize_button_text(getattr(button, "text", None))
            if actual == expected:
                await button.click()
                return actual

    try:
        await menu_message.click(
            text=lambda text: normalize_button_text(text) == expected
        )
        return action
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
        raise ValueError("عملیات اتوکلیک نامعتبر است.")

    lock = _lock_for(account_id)
    if lock.locked():
        raise AutoClickBusy("برای این اکانت یک اجرای اتوکلیک دیگر در حال انجام است.")

    started = time.perf_counter()

    async with lock:
        client = await user_client_manager.connect(account_id, session_name)

        if not await client.is_user_authorized():
            raise AutoClickUnauthorized("اکانت Telegram مجاز نیست.")

        try:
            bot = await client.get_entity(AUTOCLICK_BOT_USERNAME)
        except Exception as exc:
            raise AutoClickError(
                "ربات @MeowieQBot پیدا نشد."
            ) from exc

        bot_id = int(bot.id)

        logger.info(
            "AutoClick started account_id=%s group_id=%s action=%s",
            account_id,
            group_id,
            action,
        )

        try:
            await client.send_message(group_id, "میو")
            await asyncio.sleep(0.35)

            trigger = await client.send_message(group_id, "ماهی")

            menu = await _find_meowie_menu(
                client,
                group_id,
                bot_id,
                trigger.id,
                timeout=15.0,
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

        except FloodWaitError:
            logger.exception(
                "AutoClick FloodWait account_id=%s group_id=%s",
                account_id,
                group_id,
            )
            raise
        except RPCError:
            logger.exception(
                "AutoClick Telegram RPC error account_id=%s group_id=%s",
                account_id,
                group_id,
            )
            raise
        except Exception:
            logger.exception(
                "AutoClick failed account_id=%s group_id=%s action=%s",
                account_id,
                group_id,
                action,
            )
            raise

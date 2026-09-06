from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, Table, select, func
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base
from app.db.models import Account
from app.db.session import SessionLocal
from app.services.meowie_parser import (
    button_contains_any,
    find_first_matching_button,
    is_percentage_button,
    normalize_text,
    parse_cat_panel,
    parse_factory_main,
    parse_meow_response,
    parse_production_confirmation,
)
from app.userbot import user_client_manager

logger = logging.getLogger(__name__)

MEOWIE_USERNAME = "MeowieQBot"
DEFAULT_GROUP_COMMANDS = {
    "cat": "گربه",
    "meow": "میو",
    "factory": "کارخونه میویی",
}

MIN_COMMAND_TIMEOUT = 4.0
MAX_COMMAND_TIMEOUT = 25.0

MEOWIE_ACTION_ALIASES = {
    "collect": ("جمع آوری", "جمع‌آوری", "دریافت", "برداشت", "گرفتن میو", "دریافت میو پوینت"),
    "upgrade": ("ارتقا", "ارتقا سطح", "افزایش سطح", "آپگرید", "upgrade"),
    "storage": ("انبار", "ارتقای انبار", "ارتقا انبار", "storage"),
    "workers": ("کارگران", "کارگر", "ارتقای کارگران", "صندلی", "workers"),
    "machines": ("دستگاه", "دستگاه ها", "دستگاه‌های تولید", "ارتقای دستگاه", "machines"),
    "production": ("تولید", "درحال تولید", "در حال تولید", "production"),
    "start": ("شروع تولید", "تولید", "start production", "شروع"),
    "cancel": ("لغو", "انصراف", "cancel"),
    "back": ("بازگشت", "برگشت", "قبلی", "back"),
    "hire": ("استخدام", "خرید گربه", "گرفتن کارگر", "hire"),
}

MEOWIE_SETTING_TABLE = Table(
    "meowie_automation_settings",
    Base.metadata,
    Column("account_id", Integer, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("enabled", Boolean, nullable=False),
    Column("group_peer_id", BigInteger),
    Column("group_title", String(255)),
    Column("group_username", String(255)),
    Column("meow_enabled", Boolean, nullable=False),
    Column("meow_retry_seconds", Integer, nullable=False),
    Column("cat_enabled", Boolean, nullable=False),
    Column("cat_collect_enabled", Boolean, nullable=False),
    Column("cat_collect_interval_seconds", Integer, nullable=False),
    Column("cat_upgrade_enabled", Boolean, nullable=False),
    Column("cat_upgrade_retry_seconds", Integer, nullable=False),
    Column("factory_enabled", Boolean, nullable=False),
    Column("factory_storage_upgrade", Boolean, nullable=False),
    Column("factory_workers_upgrade", Boolean, nullable=False),
    Column("factory_machines_upgrade", Boolean, nullable=False),
    Column("factory_products", JSONB, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column("updated_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)


@dataclass(slots=True)
class CommandResult:
    command: str
    sent_message_id: int
    message: Any | None


_locks: dict[int, asyncio.Lock] = {}


def account_lock(account_id: int) -> asyncio.Lock:
    return _locks.setdefault(account_id, asyncio.Lock())


def _button(message: Any, aliases: tuple[str, ...]):
    return find_first_matching_button(
        message,
        lambda text: button_contains_any(text, *aliases),
    )


def _button_text(button: Any) -> str:
    return normalize_text(getattr(button, "text", ""))


async def _find_new_bot_message(
    client: Any,
    group_id: int,
    bot_id: int,
    after_message_id: int,
    *,
    timeout: float = MIN_COMMAND_TIMEOUT,
) -> Any | None:
    deadline = time.monotonic() + min(max(timeout, MIN_COMMAND_TIMEOUT), MAX_COMMAND_TIMEOUT)
    while time.monotonic() < deadline:
        messages = await client.get_messages(group_id, limit=40)
        candidates = []
        for message in messages:
            if not message or int(getattr(message, "id", 0)) <= after_message_id:
                continue
            sender_id = getattr(message, "sender_id", None)
            via_bot_id = getattr(message, "via_bot_id", None)
            if sender_id == bot_id or via_bot_id == bot_id:
                candidates.append(message)
        if candidates:
            return max(candidates, key=lambda item: int(item.id))
        await asyncio.sleep(0.25)
    return None


async def command(
    client: Any,
    group_id: int,
    bot_id: int,
    text: str,
    *,
    timeout: float = MIN_COMMAND_TIMEOUT,
) -> CommandResult:
    sent = await client.send_message(group_id, text)
    response = await _find_new_bot_message(
        client,
        group_id,
        bot_id,
        int(sent.id),
        timeout=timeout,
    )
    return CommandResult(text, int(sent.id), response)


async def click_button(button: Any) -> Any:
    if button is None:
        return None
    return await button.click()


async def load_enabled_accounts() -> set[int]:
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(MEOWIE_SETTING_TABLE.c.account_id)
                .join(Account, Account.id == MEOWIE_SETTING_TABLE.c.account_id)
                .where(
                    MEOWIE_SETTING_TABLE.c.enabled.is_(True),
                    MEOWIE_SETTING_TABLE.c.group_peer_id.is_not(None),
                    Account.is_connected.is_(True),
                )
            )
        ).all()
    return {int(row[0]) for row in rows}


async def load_account_state(account_id: int) -> tuple[Account | None, dict[str, Any] | None]:
    async with SessionLocal() as db:
        account = await db.get(Account, account_id)
        if not account:
            return None, None
        result = await db.execute(
            select(MEOWIE_SETTING_TABLE).where(MEOWIE_SETTING_TABLE.c.account_id == account_id)
        )
        row = result.mappings().first()
        return account, dict(row) if row else None


async def meowie_cycle(account_id: int) -> None:
    account, setting = await load_account_state(account_id)
    if not account or not setting or not setting.get("group_peer_id"):
        return

    client = await user_client_manager.connect(account.id, account.session_name)
    if not await client.is_user_authorized():
        logger.warning("Meowie account %s is not authorized", account_id)
        return

    bot = await client.get_entity(MEOWIE_USERNAME)
    bot_id = int(bot.id)
    group_id = int(setting["group_peer_id"])

    now = time.monotonic()

    if setting.get("meow_enabled"):
        result = await command(client, group_id, bot_id, DEFAULT_GROUP_COMMANDS["meow"], timeout=6)
        parsed = parse_meow_response(getattr(result.message, "raw_text", None) if result.message else None)
        if parsed.retry_after_seconds:
            await asyncio.sleep(max(1, min(parsed.retry_after_seconds, 3600)))

    if setting.get("cat_enabled") and setting.get("cat_collect_enabled"):
        result = await command(client, group_id, bot_id, DEFAULT_GROUP_COMMANDS["cat"])
        panel = parse_cat_panel(getattr(result.message, "raw_text", None) if result.message else None)
        if panel.detected and result.message:
            collect = _button(result.message, MEOWIE_ACTION_ALIASES["collect"])
            if collect:
                await click_button(collect)
        await asyncio.sleep(max(1, int(setting.get("cat_collect_interval_seconds") or 300)))

    if setting.get("cat_enabled") and setting.get("cat_upgrade_enabled"):
        await _upgrade_cat(client, group_id, bot_id, int(setting.get("cat_upgrade_retry_seconds") or 300))

    if setting.get("factory_enabled"):
        await _factory_cycle(client, group_id, bot_id, setting)

    logger.debug("Meowie cycle completed account=%s elapsed=%.2fs", account_id, time.monotonic() - now)


async def _upgrade_cat(client: Any, group_id: int, bot_id: int, retry_seconds: int) -> None:
    for _ in range(50):
        result = await command(client, group_id, bot_id, DEFAULT_GROUP_COMMANDS["cat"])
        message = result.message
        state = parse_cat_panel(getattr(message, "raw_text", None) if message else None)
        if not state.detected or not message:
            return
        upgrade = _button(message, MEOWIE_ACTION_ALIASES["upgrade"])
        if not upgrade:
            await asyncio.sleep(max(1, min(retry_seconds, 3600)))
            return
        await click_button(upgrade)
        await asyncio.sleep(0.6)


async def _factory_cycle(client: Any, group_id: int, bot_id: int, setting: dict[str, Any]) -> None:
    main = await command(client, group_id, bot_id, DEFAULT_GROUP_COMMANDS["factory"], timeout=8)
    message = main.message
    factory = parse_factory_main(getattr(message, "raw_text", None) if message else None)
    if not factory.detected or not message:
        return

    toggles = (
        ("factory_storage_upgrade", MEOWIE_ACTION_ALIASES["storage"]),
        ("factory_workers_upgrade", MEOWIE_ACTION_ALIASES["workers"]),
        ("factory_machines_upgrade", MEOWIE_ACTION_ALIASES["machines"]),
    )

    for enabled_key, aliases in toggles:
        if not setting.get(enabled_key):
            continue
        result = await _fresh_button_action(client, group_id, bot_id, message, aliases)
        if result:
            message = result

    products = setting.get("factory_products") or []
    if not isinstance(products, list):
        return

    for product in products[:4]:
        if not isinstance(product, dict) or not product.get("enabled"):
            continue
        name = str(product.get("product") or "").strip()
        percentage = int(product.get("percentage") or 0)
        if not name or percentage not in {25, 50, 75, 100}:
            continue
        await _produce_one(client, group_id, bot_id, name, percentage)


async def _fresh_button_action(client: Any, group_id: int, bot_id: int, message: Any, aliases: tuple[str, ...]):
    button = _button(message, aliases)
    if not button:
        return None
    await click_button(button)
    await asyncio.sleep(0.5)
    fresh = await _find_new_bot_message(client, group_id, bot_id, int(message.id), timeout=3)
    return fresh


async def _produce_one(client: Any, group_id: int, bot_id: int, product: str, percentage: int) -> None:
    main = await command(client, group_id, bot_id, DEFAULT_GROUP_COMMANDS["factory"], timeout=8)
    if not main.message:
        return

    production = _button(main.message, MEOWIE_ACTION_ALIASES["production"])
    if not production:
        return
    await click_button(production)
    await asyncio.sleep(0.5)
    menu = await _find_new_bot_message(client, group_id, bot_id, int(main.message.id), timeout=4)
    if not menu:
        return

    product_button = _button(menu, (product,))
    if not product_button:
        for row in getattr(menu, "buttons", []) or []:
            for button in row:
                if normalize_text(getattr(button, "text", "")) == normalize_text(product):
                    product_button = button
                    break
            if product_button:
                break
    if not product_button:
        return

    await click_button(product_button)
    await asyncio.sleep(0.4)
    selected = await _find_new_bot_message(client, group_id, bot_id, int(menu.id), timeout=4)
    if not selected:
        return

    pct_button = find_first_matching_button(selected, lambda text: is_percentage_button(text) == percentage)
    if not pct_button:
        return
    await click_button(pct_button)
    await asyncio.sleep(0.4)
    confirmation = await _find_new_bot_message(client, group_id, bot_id, int(selected.id), timeout=5)
    if not confirmation:
        return

    parsed = parse_production_confirmation(getattr(confirmation, "raw_text", None))
    if not parsed.detected:
        return

    start = _button(confirmation, MEOWIE_ACTION_ALIASES["start"])
    if start:
        await click_button(start)


def default_settings() -> dict[str, Any]:
    return {
        "enabled": False,
        "group_peer_id": None,
        "group_title": None,
        "group_username": None,
        "meow_enabled": False,
        "meow_retry_seconds": 30,
        "cat_enabled": False,
        "cat_collect_enabled": False,
        "cat_collect_interval_seconds": 300,
        "cat_upgrade_enabled": False,
        "cat_upgrade_retry_seconds": 300,
        "factory_enabled": False,
        "factory_storage_upgrade": False,
        "factory_workers_upgrade": False,
        "factory_machines_upgrade": False,
        "factory_products": [],
    }


async def run_meowie_worker(account_id: int) -> None:
    logger.info("Meowie worker started account_id=%s", account_id)
    try:
        while True:
            account, setting = await load_account_state(account_id)
            if not account or not setting or not setting.get("enabled") or not setting.get("group_peer_id"):
                return
            try:
                async with account_lock(account_id):
                    await meowie_cycle(account_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Meowie cycle failed account_id=%s", account_id)
            await asyncio.sleep(1)
    finally:
        logger.info("Meowie worker stopped account_id=%s", account_id)

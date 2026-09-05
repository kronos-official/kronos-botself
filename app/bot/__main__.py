from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import BotCommand, BotCommandScopeDefault, ErrorEvent
from redis.asyncio import Redis

from app.bot.handlers import account, auth, common, destinations, schedules, status, support
from app.core.config import get_settings
from app.core.logging import setup_logging


async def _configure_bot(bot: Bot, logger: logging.Logger) -> None:
    """Configure Telegram-side commands and remove any stale webhook."""
    try:
        await bot.set_my_commands(
            commands=[
                BotCommand(command="start", description="شروع و نمایش منوی اصلی"),
                BotCommand(command="panel", description="باز کردن منوی Kronos Self"),
                BotCommand(command="account", description="مدیریت اکانت Telegram"),
                BotCommand(command="help", description="راهنمای استفاده"),
                BotCommand(command="new_schedule", description="ساخت زمان‌بندی جدید"),
                BotCommand(command="cancel", description="لغو فرایند جاری"),
            ],
            scope=BotCommandScopeDefault(),
        )
    except Exception:
        logger.warning("Failed to configure Telegram bot commands", exc_info=True)

    try:
        await bot.delete_webhook(drop_pending_updates=False)
    except Exception:
        logger.debug("Webhook cleanup skipped", exc_info=True)


async def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    logger = logging.getLogger(__name__)

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    redis = Redis.from_url(
        settings.redis_url,
        decode_responses=False,
        health_check_interval=30,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
    )
    storage = RedisStorage(redis=redis)
    dp = Dispatcher(storage=storage)

    dp.include_router(common.router)
    dp.include_router(account.router)
    dp.include_router(auth.router)
    dp.include_router(status.router)
    dp.include_router(destinations.router)
    dp.include_router(schedules.router)
    dp.include_router(support.router)

    @dp.error()
    async def global_error_handler(event: ErrorEvent) -> None:
        logger.exception(
            "Unhandled Telegram update error: %r",
            event.exception,
            exc_info=event.exception,
        )

        callback = event.update.callback_query
        if callback is not None:
            try:
                await callback.answer(
                    "⚠️ یک خطای موقت رخ داد. دوباره تلاش کنید.",
                    show_alert=True,
                )
            except Exception:
                logger.debug(
                    "Failed to notify callback about the error",
                    exc_info=True,
                )
            return

        message = event.update.message
        if message is not None:
            try:
                await message.answer(
                    "⚠️ یک خطای موقت در پردازش درخواست رخ داد.\n"
                    "لطفاً چند لحظه بعد دوباره تلاش کنید."
                )
            except Exception:
                logger.debug(
                    "Failed to notify message sender about the error",
                    exc_info=True,
                )

    await _configure_bot(bot, logger)

    logger.info("Kronos Self bot started")
    try:
        await dp.start_polling(
            bot,
            allowed_updates=dp.resolve_used_update_types(),
        )
    finally:
        await storage.close()
        await redis.aclose()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())

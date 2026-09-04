import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from app.bot.handlers import auth, common, destinations, schedules, status, support
from app.core.config import get_settings
from app.core.logging import setup_logging


async def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    logger = logging.getLogger(__name__)

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    redis = Redis.from_url(settings.redis_url, decode_responses=False)
    storage = RedisStorage(redis=redis)
    dp = Dispatcher(storage=storage)

    dp.include_router(common.router)
    dp.include_router(auth.router)
    dp.include_router(status.router)
    dp.include_router(destinations.router)
    dp.include_router(schedules.router)
    dp.include_router(support.router)

    logger.info("Kronos Self bot started")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await storage.close()
        await redis.aclose()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())

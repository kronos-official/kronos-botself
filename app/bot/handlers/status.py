from aiogram import Router, F
from aiogram.types import CallbackQuery
from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.models import Account, DeliveryLog, Schedule
from app.db.session import SessionLocal

router = Router()


@router.callback_query(F.data == "status")
async def status(callback: CallbackQuery) -> None:
    settings = get_settings()
    if not callback.from_user or callback.from_user.id != settings.owner_telegram_id:
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    async with SessionLocal() as db:
        account = (
            await db.execute(
                select(Account).where(Account.owner_telegram_id == settings.owner_telegram_id)
            )
        ).scalar_one_or_none()
        active = await db.scalar(
            select(func.count(Schedule.id)).where(Schedule.enabled.is_(True))
        )
        total_logs = await db.scalar(select(func.count(DeliveryLog.id)))
        ok_logs = await db.scalar(
            select(func.count(DeliveryLog.id)).where(DeliveryLog.ok.is_(True))
        )

    total_logs = int(total_logs or 0)
    ok_logs = int(ok_logs or 0)
    await callback.message.edit_text(
        "📊 <b>وضعیت Kronos Self</b>\n\n"
        f"اکانت: {'✅ متصل' if account and account.is_connected else '❌ متصل نیست'}\n"
        f"زمان‌بندی فعال: {int(active or 0)}\n"
        f"کل ارسال‌ها: {total_logs}\n"
        f"موفق: {ok_logs}\n"
        f"ناموفق: {total_logs - ok_logs}"
    )
    await callback.answer()

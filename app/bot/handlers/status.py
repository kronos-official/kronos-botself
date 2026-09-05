from aiogram import F, Router
from aiogram.types import CallbackQuery
from sqlalchemy import func, select

from app.db.models import Account, DeliveryLog, Schedule
from app.db.session import SessionLocal


router = Router()


@router.callback_query(F.data == "status")
async def status(callback: CallbackQuery) -> None:
    if not callback.from_user:
        await callback.answer()
        return

    telegram_user_id = callback.from_user.id

    async with SessionLocal() as db:
        account = (
            await db.execute(
                select(Account).where(
                    Account.owner_telegram_id == telegram_user_id
                )
            )
        ).scalar_one_or_none()

        if account:
            active = await db.scalar(
                select(func.count(Schedule.id)).where(
                    Schedule.account_id == account.id,
                    Schedule.enabled.is_(True),
                )
            )

            total_logs = await db.scalar(
                select(func.count(DeliveryLog.id))
                .join(
                    Schedule,
                    Schedule.id == DeliveryLog.schedule_id,
                )
                .where(
                    Schedule.account_id == account.id
                )
            )

            ok_logs = await db.scalar(
                select(func.count(DeliveryLog.id))
                .join(
                    Schedule,
                    Schedule.id == DeliveryLog.schedule_id,
                )
                .where(
                    Schedule.account_id == account.id,
                    DeliveryLog.ok.is_(True),
                )
            )
        else:
            active = 0
            total_logs = 0
            ok_logs = 0

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

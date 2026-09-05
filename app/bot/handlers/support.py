from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.bot.keyboards.main import main_keyboard


router = Router()


@router.callback_query(F.data == "support:info")
async def support_info(callback: CallbackQuery) -> None:
    if not callback.from_user:
        await callback.answer()
        return

    await callback.message.edit_text(
        "🎫 <b>مرکز پشتیبانی Kronos Self</b>\n\n"
        "برای ثبت درخواست فنی، بررسی حساب، پیشنهاد یا مشکل پرداخت، "
        "وارد Mini App شوید و از بخش <b>پشتیبانی</b> یک Ticket بسازید.\n\n"
        "در Mini App می‌توانید تیکت‌های قبلی، وضعیت، پیام‌ها و تاریخچه هر درخواست را ببینید.",
        reply_markup=main_keyboard(),
    )

    await callback.answer()

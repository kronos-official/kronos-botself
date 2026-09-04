from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

from app.bot.keyboards.main import main_keyboard
from app.core.config import get_settings

router = Router()


def owner_only(user_id: int) -> bool:
    return user_id == get_settings().owner_telegram_id


MAIN_TEXT = (
    "⏳ <b>Kronos Self</b>\n"
    "<i>Personal Telegram Control Center</i>\n\n"
    "مرکز کنترل شخصی شما برای مدیریت User Client، مقصدها، "
    "زمان‌بندی ارسال، گزارش تحویل و پشتیبانی ساختاریافته.\n\n"
    "<b>وضعیت پنل:</b> 🟢 آماده\n"
    "<b>امنیت نشست:</b> 🔐 فعال\n"
    "<b>Scheduler:</b> ⚡ قابل استفاده\n\n"
    "از منوی زیر عملیات موردنظر را انتخاب کنید."
)


@router.message(CommandStart())
async def start(message: Message) -> None:
    if not message.from_user or not owner_only(message.from_user.id):
        await message.answer("⛔ این ربات خصوصی است و فقط برای مالک فعال شده است.")
        return
    await message.answer(MAIN_TEXT, reply_markup=main_keyboard())


@router.callback_query(lambda c: c.data == "help")
async def help_cb(callback: CallbackQuery) -> None:
    if not callback.from_user or not owner_only(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return
    text = (
        "📚 <b>راهنمای Kronos Self</b>\n\n"
        "<b>۱. اتصال اکانت</b>\n"
        "شماره اکانت User Client را وارد کنید. سپس کد ورود را فقط با کیپد عددی ارسال کنید.\n\n"
        "<b>۲. مقصدها</b>\n"
        "پس از اتصال، مقصدهای Telegram را همگام‌سازی کنید. کاربران، ربات‌ها، گروه‌ها و کانال‌ها جداگانه نمایش داده می‌شوند.\n\n"
        "<b>۳. Scheduler</b>\n"
        "پیام متنی یا Media بسازید و آن را یک‌بار، روزانه، هفتگی یا با فاصله مشخص اجرا کنید.\n\n"
        "<b>۴. لاگ‌ها</b>\n"
        "نتیجه ارسال، زمان اجرا، شناسه پیام و خطاهای احتمالی را بررسی کنید.\n\n"
        "<b>۵. پشتیبانی</b>\n"
        "از داخل Mini App برای ساخت و پیگیری Ticket استفاده کنید."
    )
    await callback.message.edit_text(text, reply_markup=main_keyboard())
    await callback.answer()


@router.callback_query(lambda c: c.data == "back:main")
async def back_main(callback: CallbackQuery) -> None:
    if not callback.from_user or not owner_only(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return
    await callback.message.edit_text(MAIN_TEXT, reply_markup=main_keyboard())
    await callback.answer()

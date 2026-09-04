from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

from app.bot.keyboards.main import main_keyboard

router = Router()


MAIN_TEXT = (
    "⏳ <b>Kronos Self</b>\n"
    "<i>Professional Personal Telegram Control Center</i>\n\n"
    "به Kronos Self خوش آمدید.\n\n"
    "این ربات به شما امکان می‌دهد Telegram User Client خودتان را "
    "متصل کنید، مقصدها را مدیریت کنید و ارسال‌های زمان‌بندی‌شده بسازید.\n\n"
    "<b>وضعیت پنل:</b> 🟢 آماده\n"
    "<b>امنیت نشست:</b> 🔐 فعال\n"
    "<b>Scheduler:</b> ⚡ آماده\n\n"
    "برای شروع، اکانت Telegram خود را از بخش «اتصال اکانت» متصل کنید."
)


@router.message(CommandStart())
async def start(message: Message) -> None:
    if not message.from_user:
        return

    await message.answer(
        MAIN_TEXT,
        reply_markup=main_keyboard(),
    )


@router.callback_query(lambda c: c.data == "help")
async def help_cb(callback: CallbackQuery) -> None:
    if not callback.from_user:
        return

    text = (
        "📚 <b>راهنمای Kronos Self</b>\n\n"
        "<b>۱. اتصال اکانت</b>\n"
        "شماره اکانت Telegram خودتان را وارد کنید و مراحل ورود را کامل کنید.\n\n"
        "<b>۲. مقصدها</b>\n"
        "پس از اتصال، Dialogهای Telegram شما همگام‌سازی می‌شوند.\n\n"
        "<b>۳. Scheduler</b>\n"
        "پیام متنی یا Media بسازید و آن را یک‌بار، روزانه، هفتگی یا با فاصله مشخص اجرا کنید.\n\n"
        "<b>۴. لاگ‌ها</b>\n"
        "نتیجه ارسال‌ها و خطاهای مربوط به حساب خودتان را بررسی کنید.\n\n"
        "<b>۵. پشتیبانی</b>\n"
        "از داخل Mini App برای ساخت و پیگیری Ticket استفاده کنید."
    )

    await callback.message.edit_text(
        text,
        reply_markup=main_keyboard(),
    )
    await callback.answer()


@router.callback_query(lambda c: c.data == "back:main")
async def back_main(callback: CallbackQuery) -> None:
    if not callback.from_user:
        return

    await callback.message.edit_text(
        MAIN_TEXT,
        reply_markup=main_keyboard(),
    )
    await callback.answer()
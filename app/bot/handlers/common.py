from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.bot.keyboards.main import main_keyboard

router = Router()


MAIN_TEXT = (
    "⏳ <b>Kronos Self</b>\n"
    "<i>Personal Telegram Control Center</i>\n\n"
    "به Kronos Self خوش آمدید.\n\n"
    "اینجا می‌توانید User Client خودتان را متصل کنید، "
    "مقصدهای Telegram را همگام‌سازی کنید و ارسال‌های خودکار و زمان‌بندی‌شده بسازید.\n\n"
    "<b>🟢 سرویس:</b> آماده\n"
    "<b>🔐 امنیت نشست:</b> فعال\n"
    "<b>⚡ Scheduler:</b> فعال\n\n"
    "برای شروع، یکی از گزینه‌های زیر را انتخاب کنید."
)


HELP_TEXT = (
    "📚 <b>راهنمای Kronos Self</b>\n\n"
    "<b>🔐 اتصال اکانت</b>\n"
    "اکانت Telegram خودتان را با شماره، کد ورود و در صورت نیاز 2FA متصل کنید.\n\n"
    "<b>🎯 مقصدها</b>\n"
    "گفتگوهای خصوصی، Botها، گروه‌ها و کانال‌های اکانت متصل را همگام‌سازی و مدیریت کنید.\n\n"
    "<b>⏰ زمان‌بندی‌ها</b>\n"
    "پیام متنی یا Media را برای اجرای یک‌باره، روزانه، هفتگی یا فاصله‌ای تنظیم کنید.\n\n"
    "<b>📊 وضعیت</b>\n"
    "اتصال اکانت، زمان‌بندی‌های فعال و آمار ارسال‌ها را ببینید.\n\n"
    "<b>🎫 پشتیبانی</b>\n"
    "برای مشکل فنی، حساب، پیشنهاد یا سایر درخواست‌ها از Mini App تیکت ثبت کنید."
)


async def _show_main(target: Message | CallbackQuery) -> None:
    if isinstance(target, Message):
        await target.answer(MAIN_TEXT, reply_markup=main_keyboard())
        return

    if target.message is not None:
        await target.message.edit_text(MAIN_TEXT, reply_markup=main_keyboard())
    await target.answer()


@router.message(CommandStart())
async def start(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return

    await state.clear()
    await message.answer(MAIN_TEXT, reply_markup=main_keyboard())


@router.message(Command("help"))
async def help_command(message: Message) -> None:
    if not message.from_user:
        return

    await message.answer(HELP_TEXT, reply_markup=main_keyboard())


@router.message(Command("panel"))
async def panel_command(message: Message) -> None:
    if not message.from_user:
        return

    keyboard = main_keyboard()
    await message.answer(
        "🚀 <b>Control Center</b>\n\n"
        "از منوی زیر پنل موردنظر را باز کنید.",
        reply_markup=keyboard,
    )


@router.message(Command("cancel"))
async def cancel_command(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return

    current = await state.get_state()
    if current is None:
        await message.answer(
            "ℹ️ هیچ فرایند فعالی برای لغو وجود ندارد.",
            reply_markup=main_keyboard(),
        )
        return

    await state.clear()
    await message.answer(
        "✅ فرایند جاری لغو شد.",
        reply_markup=main_keyboard(),
    )


@router.callback_query(lambda c: c.data == "help")
async def help_cb(callback: CallbackQuery) -> None:
    if not callback.from_user:
        await callback.answer()
        return

    if callback.message is not None:
        await callback.message.edit_text(
            HELP_TEXT,
            reply_markup=main_keyboard(),
        )
    await callback.answer()


@router.callback_query(lambda c: c.data == "back:main")
async def back_main(callback: CallbackQuery) -> None:
    if not callback.from_user:
        await callback.answer()
        return

    await _show_main(callback)

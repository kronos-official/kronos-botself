from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import select, update

from app.bot.keyboards.main import back_menu, main_keyboard
from app.core.config import get_settings
from app.db.models import Account, Schedule
from app.db.session import SessionLocal
from app.userbot import user_client_manager

router = Router()
settings = get_settings()
logger = logging.getLogger(__name__)


def account_menu(*, connected: bool) -> InlineKeyboardMarkup:
    if connected:
        return InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🔄 بررسی اتصال",
                        callback_data="account:check",
                    ),
                    InlineKeyboardButton(
                        text="🗑 قطع اتصال",
                        callback_data="account:disconnect:confirm",
                    ),
                ],
                [
                    InlineKeyboardButton(
                        text="🚀 باز کردن Mini App",
                        web_app=None,
                    )
                ],
                [
                    InlineKeyboardButton(
                        text="⬅️ منوی اصلی",
                        callback_data="back:main",
                    )
                ],
            ]
        )

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🔐 اتصال اکانت",
                    callback_data="account:connect",
                )
            ],
            [
                InlineKeyboardButton(
                    text="⬅️ منوی اصلی",
                    callback_data="back:main",
                )
            ],
        ]
    )


def _account_text(account: Account | None) -> str:
    if not account or not account.is_connected:
        return (
            "🔐 <b>مدیریت اکانت Telegram</b>\n\n"
            "🟠 وضعیت: <b>متصل نیست</b>\n\n"
            "برای استفاده از امکانات User Client، ابتدا اکانت Telegram خودتان را متصل کنید."
        )

    return (
        "🔐 <b>مدیریت اکانت Telegram</b>\n\n"
        "🟢 وضعیت: <b>متصل</b>\n"
        f"🆔 شناسه Telegram: <code>{account.telegram_user_id or '—'}</code>\n"
        f"📱 شماره: <code>••••{account.phone_hint or '—'}</code>\n\n"
        "نشست شما به‌صورت مستقل برای حساب Telegram خودتان نگهداری می‌شود."
    )


async def _load_account(telegram_user_id: int) -> Account | None:
    async with SessionLocal() as db:
        return (
            await db.execute(
                select(Account).where(
                    Account.owner_telegram_id == telegram_user_id
                )
            )
        ).scalar_one_or_none()


@router.callback_query(F.data == "account:manage")
async def account_manage(callback: CallbackQuery) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    account = await _load_account(callback.from_user.id)

    if callback.message is not None:
        await callback.message.edit_text(
            _account_text(account),
            reply_markup=account_menu(connected=bool(account and account.is_connected)),
        )

    await callback.answer()


@router.callback_query(F.data == "account:check")
async def account_check(callback: CallbackQuery) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    account = await _load_account(callback.from_user.id)
    if account is None:
        await callback.answer("هنوز اکانتی ثبت نشده است.", show_alert=True)
        return

    try:
        authorized = await user_client_manager.is_authorized(
            account.id,
            account.session_name,
        )
    except Exception:
        logger.exception("Failed to check Telegram session for account_id=%s", account.id)
        await callback.answer("⚠️ بررسی اتصال انجام نشد.", show_alert=True)
        return

    async with SessionLocal() as db:
        current = await db.get(Account, account.id)
        if current is None:
            await callback.answer("اکانت پیدا نشد.", show_alert=True)
            return
        current.is_connected = authorized
        await db.commit()
        account = current

    if callback.message is not None:
        await callback.message.edit_text(
            _account_text(account),
            reply_markup=account_menu(connected=authorized),
        )

    await callback.answer("✅ وضعیت اکانت بروزرسانی شد.")


@router.callback_query(F.data == "account:disconnect:confirm")
async def account_disconnect_confirm(callback: CallbackQuery) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    account = await _load_account(callback.from_user.id)
    if not account or not account.is_connected:
        await callback.answer("اکانت از قبل متصل نیست.", show_alert=True)
        return

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⚠️ بله، قطع و حذف Session",
                    callback_data="account:disconnect:final",
                )
            ],
            [
                InlineKeyboardButton(
                    text="لغو",
                    callback_data="account:manage",
                )
            ],
        ]
    )

    if callback.message is not None:
        await callback.message.edit_text(
            "⚠️ <b>قطع اتصال اکانت</b>\n\n"
            "این عملیات:"
            "\n• اتصال User Client را قطع می‌کند."
            "\n• Session محلی را حذف می‌کند."
            "\n• زمان‌بندی‌های این اکانت را متوقف می‌کند."
            "\n\nبرای اتصال دوباره، باید فرآیند ورود Telegram را مجدداً انجام دهید.",
            reply_markup=keyboard,
        )

    await callback.answer()


@router.callback_query(F.data == "account:disconnect:final")
async def account_disconnect_final(callback: CallbackQuery, state: FSMContext) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    await state.clear()
    account = await _load_account(callback.from_user.id)
    if not account or not account.is_connected:
        await callback.answer("اکانت متصل نیست.", show_alert=True)
        return

    try:
        await user_client_manager.disconnect_account(
            account.id,
            account.session_name,
            delete_session=True,
        )
    except Exception:
        logger.exception("Failed to disconnect account_id=%s", account.id)
        await callback.answer("❌ قطع اتصال انجام نشد.", show_alert=True)
        return

    async with SessionLocal() as db:
        current = await db.get(Account, account.id)
        if current is not None:
            current.is_connected = False
            current.telegram_user_id = None
            current.phone_hint = None

        await db.execute(
            update(Schedule)
            .where(Schedule.account_id == account.id)
            .values(enabled=False)
        )
        await db.commit()

    if callback.message is not None:
        await callback.message.edit_text(
            "✅ <b>اکانت با موفقیت قطع شد.</b>\n\n"
            "Session محلی حذف شد و زمان‌بندی‌های مربوط به این اکانت متوقف شدند.",
            reply_markup=main_keyboard(),
        )

    await callback.answer("✅ اتصال قطع شد.")


@router.callback_query(F.data == "account:back")
async def account_back(callback: CallbackQuery) -> None:
    if callback.message is not None:
        await callback.message.edit_text(
            "🔐 <b>مدیریت اکانت</b>",
            reply_markup=back_menu(),
        )
    await callback.answer()

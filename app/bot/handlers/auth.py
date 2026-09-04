from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from sqlalchemy import select
from telethon.errors import (
    FloodWaitError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
    PasswordHashInvalidError,
    SessionPasswordNeededError,
)

from app.bot.keyboards.auth import code_keyboard, code_message
from app.bot.keyboards.main import main_keyboard
from app.bot.states import AuthStates
from app.core.config import get_settings
from app.db.models import Account
from app.db.session import SessionLocal
from app.userbot import user_client_manager

router = Router()
settings = get_settings()
logger = logging.getLogger(__name__)

_CODE_MAX_LENGTH = 8


def _normalize_digits(value: str) -> str:
    """Normalize Persian/Arabic numerals to ASCII digits."""
    translation = str.maketrans(
        "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩",
        "01234567890123456789",
    )
    return value.translate(translation)


def _is_owner(user_id: int | None) -> bool:
    return user_id is not None and user_id == settings.owner_telegram_id


def _current_code(data: dict) -> str:
    return str(data.get("code_buffer", ""))


async def _safe_edit_code_prompt(
    callback: CallbackQuery,
    code: str,
    *,
    can_resend: bool = True,
) -> None:
    if callback.message is None:
        return
    try:
        await callback.message.edit_text(
            code_message(code, can_resend=can_resend),
            reply_markup=code_keyboard(can_resend=can_resend),
        )
    except TelegramBadRequest as exc:
        # Editing the same content twice is harmless; Telegram reports it as a bad request.
        if "message is not modified" not in str(exc).lower():
            raise


@router.callback_query(F.data == "account:connect")
async def connect_start(callback: CallbackQuery, state: FSMContext):
    if not _is_owner(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    await state.clear()
    await state.set_state(AuthStates.phone)
    await callback.message.answer(
        "📱 شمارهٔ اکانت را با فرمت بین‌المللی بفرستید.\n"
        "مثال: <code>+989121234567</code>"
    )
    await callback.answer()


@router.message(AuthStates.phone)
async def receive_phone(message: Message, state: FSMContext):
    if not _is_owner(message.from_user.id) or not message.text:
        return

    phone = message.text.strip()
    if not phone.startswith("+") or not phone[1:].replace(" ", "").isdigit():
        await message.answer(
            "❌ شمارهٔ تلفن معتبر نیست.\n"
            "شماره را با + و کد کشور ارسال کنید."
        )
        return

    async with SessionLocal() as db:
        account = (
            await db.execute(
                select(Account).where(
                    Account.owner_telegram_id == settings.owner_telegram_id
                )
            )
        ).scalar_one_or_none()

        if account is None:
            account = Account(
                owner_telegram_id=settings.owner_telegram_id,
                session_name=f"account_{settings.owner_telegram_id}",
            )
            db.add(account)
            await db.commit()
            await db.refresh(account)

    try:
        phone_code_hash = await user_client_manager.start_login(
            account.id,
            account.session_name,
            phone,
        )
    except PhoneNumberInvalidError:
        await message.answer("❌ شمارهٔ تلفن توسط Telegram معتبر شناخته نشد.")
        return
    except FloodWaitError as exc:
        await message.answer(
            f"⏳ Telegram موقتاً درخواست جدید را محدود کرده است. "
            f"حدود {exc.seconds} ثانیه صبر کنید."
        )
        return
    except Exception:
        logger.exception("Failed to start Telegram login")
        await message.answer("❌ ارسال کد ورود انجام نشد. لاگ Bot را بررسی کنید.")
        return

    await state.update_data(
        account_id=account.id,
        session_name=account.session_name,
        phone=phone,
        phone_code_hash=phone_code_hash,
        code_buffer="",
    )
    await state.set_state(AuthStates.code)

    await message.answer(
        code_message(""),
        reply_markup=code_keyboard(),
    )


@router.message(AuthStates.code)
async def reject_text_code(message: Message):
    """Do not accept the login code as a normal chat message."""
    if not _is_owner(message.from_user.id):
        return
    await message.answer(
        "⚠️ برای جلوگیری از باطل شدن/مشکل در پردازش کد، آن را به‌صورت پیام متنی ارسال نکنید.\n"
        "از صفحه‌کلید عددی زیر استفاده کنید."
    )


@router.callback_query(AuthStates.code, F.data.startswith("auth:digit:"))
async def append_digit(callback: CallbackQuery, state: FSMContext):
    if not _is_owner(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    raw = callback.data.rsplit(":", 1)[-1]
    if raw not in "0123456789":
        await callback.answer("رقم نامعتبر است.", show_alert=True)
        return

    data = await state.get_data()
    code = _current_code(data)
    if len(code) >= _CODE_MAX_LENGTH:
        await callback.answer("کد طولانی‌تر از حد مجاز است.", show_alert=True)
        return

    code += raw
    await state.update_data(code_buffer=code)
    await _safe_edit_code_prompt(callback, code)
    await callback.answer()


@router.callback_query(AuthStates.code, F.data == "auth:delete")
async def delete_digit(callback: CallbackQuery, state: FSMContext):
    if not _is_owner(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    data = await state.get_data()
    code = _current_code(data)[:-1]
    await state.update_data(code_buffer=code)
    await _safe_edit_code_prompt(callback, code)
    await callback.answer()


@router.callback_query(AuthStates.code, F.data == "auth:resend")
async def resend_code(callback: CallbackQuery, state: FSMContext):
    if not _is_owner(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    data = await state.get_data()
    required = ("account_id", "session_name", "phone")
    if not all(data.get(key) for key in required):
        await callback.answer("جلسهٔ ورود منقضی شده است. دوباره شروع کنید.", show_alert=True)
        await state.clear()
        return

    try:
        phone_code_hash = await user_client_manager.start_login(
            int(data["account_id"]),
            data["session_name"],
            data["phone"],
        )
    except FloodWaitError as exc:
        await callback.answer(f"{exc.seconds} ثانیه صبر کنید.", show_alert=True)
        return
    except Exception:
        logger.exception("Failed to resend Telegram login code")
        await callback.answer("ارسال مجدد کد انجام نشد.", show_alert=True)
        return

    await state.update_data(
        phone_code_hash=phone_code_hash,
        code_buffer="",
    )
    await _safe_edit_code_prompt(callback, "")
    await callback.answer("✅ کد جدید ارسال شد.")


@router.callback_query(AuthStates.code, F.data == "auth:confirm")
async def confirm_code(callback: CallbackQuery, state: FSMContext):
    if not _is_owner(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    data = await state.get_data()
    code = _current_code(data)

    if len(code) < 3:
        await callback.answer("کد هنوز کامل نشده است.", show_alert=True)
        return

    try:
        ok, result = await user_client_manager.finish_login(
            int(data["account_id"]),
            data["session_name"],
            data["phone"],
            code,
            data["phone_code_hash"],
        )
    except PhoneCodeInvalidError:
        await callback.answer("❌ کد اشتباه است.", show_alert=True)
        return
    except PhoneCodeExpiredError:
        await state.update_data(code_buffer="")
        await _safe_edit_code_prompt(callback, "", can_resend=True)
        await callback.answer(
            "⏱ کد منقضی شده است؛ از «کد جدید» استفاده کنید.",
            show_alert=True,
        )
        return
    except FloodWaitError as exc:
        await callback.answer(
            f"Telegram درخواست را محدود کرده؛ {exc.seconds} ثانیه صبر کنید.",
            show_alert=True,
        )
        return
    except SessionPasswordNeededError:
        ok, result = False, "PASSWORD_REQUIRED"
    except Exception:
        logger.exception("Failed to finish Telegram login")
        await callback.answer("❌ ورود انجام نشد. لاگ Bot را بررسی کنید.", show_alert=True)
        return

    if not ok and result == "PASSWORD_REQUIRED":
        await state.set_state(AuthStates.password)
        await callback.message.edit_text(
            "🔒 <b>احراز هویت دو مرحله‌ای</b>\n\n"
            "رمز 2FA اکانت را بفرستید."
        )
        await callback.answer()
        return

    if not ok:
        await callback.answer("ورود ناموفق بود.", show_alert=True)
        await state.clear()
        return

    await _mark_connected(data, result)
    await state.clear()
    await callback.message.edit_text(
        "✅ <b>اکانت با موفقیت متصل شد.</b>\n\n"
        "اتصال User Client با موفقیت انجام شد.\n"
        "برای مدیریت مقصدها، زمان‌بندی‌ها و تنظیمات، پنل شخصی را باز کنید.",
        reply_markup=main_keyboard(),
    )
    await callback.answer("✅ اتصال موفق بود.")


@router.callback_query(AuthStates.code, F.data == "auth:cancel")
async def cancel_code(callback: CallbackQuery, state: FSMContext):
    if not _is_owner(callback.from_user.id):
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return
    await state.clear()
    await callback.message.edit_text("❌ فرایند اتصال اکانت لغو شد.")
    await callback.answer()


@router.message(AuthStates.password)
async def receive_password(message: Message, state: FSMContext):
    if not _is_owner(message.from_user.id) or not message.text:
        return

    data = await state.get_data()
    try:
        ok, result = await user_client_manager.finish_login(
            int(data["account_id"]),
            data["session_name"],
            data["phone"],
            "",
            data["phone_code_hash"],
            password=message.text.strip(),
        )
    except PasswordHashInvalidError:
        await message.answer("❌ رمز 2FA صحیح نیست.")
        return
    except FloodWaitError as exc:
        await message.answer(f"⏳ Telegram محدودیت اعمال کرده است؛ {exc.seconds} ثانیه صبر کنید.")
        return
    except Exception:
        logger.exception("Failed to finish 2FA login")
        await message.answer("❌ ورود با 2FA انجام نشد. لاگ Bot را بررسی کنید.")
        return

    if not ok:
        await message.answer("❌ ورود ناموفق بود.")
        return

    await _mark_connected(data, result)
    await state.clear()
    await message.answer(
        "✅ <b>اکانت با موفقیت متصل شد.</b>\n\n"
        "پنل شخصی Kronos Self برای مدیریت آماده است.",
        reply_markup=main_keyboard(),
    )


async def _mark_connected(data: dict, result) -> None:
    async with SessionLocal() as db:
        account = await db.get(Account, data["account_id"])
        if account is None:
            raise RuntimeError("Account record not found")
        account.is_connected = True
        account.telegram_user_id = int(result.id)
        account.phone_hint = data["phone"][-4:]
        await db.commit()

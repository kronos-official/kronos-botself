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
from app.db.models import Account
from app.db.session import SessionLocal
from app.userbot import user_client_manager

router = Router()
logger = logging.getLogger(__name__)

_CODE_MAX_LENGTH = 8


def _normalize_digits(value: str) -> str:
    """Normalize Persian/Arabic numerals to ASCII digits."""
    translation = str.maketrans(
        "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩",
        "01234567890123456789",
    )
    return value.translate(translation)


def _current_code(data: dict) -> str:
    return str(data.get("code_buffer", ""))


async def _get_or_create_account(telegram_user_id: int) -> Account:
    """
    Get the Telegram user's Account record.

    Each Telegram user owns one Account record identified by
    Account.owner_telegram_id.
    """
    async with SessionLocal() as db:
        account = (
            await db.execute(
                select(Account).where(
                    Account.owner_telegram_id == telegram_user_id
                )
            )
        ).scalar_one_or_none()

        if account is None:
            account = Account(
                owner_telegram_id=telegram_user_id,
                session_name=f"account_{telegram_user_id}",
            )
            db.add(account)
            await db.commit()
            await db.refresh(account)

        return account


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
        if "message is not modified" not in str(exc).lower():
            raise


@router.callback_query(F.data == "account:connect")
async def connect_start(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if callback.from_user is None:
        await callback.answer("کاربر شناسایی نشد.", show_alert=True)
        return

    await state.clear()
    await state.set_state(AuthStates.phone)

    await callback.message.answer(
        "📱 <b>اتصال اکانت Telegram</b>\n\n"
        "شمارهٔ اکانت Telegram را با فرمت بین‌المللی ارسال کنید.\n\n"
        "مثال:\n"
        "<code>+989121234567</code>"
    )

    await callback.answer()


@router.message(AuthStates.phone)
async def receive_phone(
    message: Message,
    state: FSMContext,
) -> None:
    if message.from_user is None or not message.text:
        return

    telegram_user_id = message.from_user.id
    phone = _normalize_digits(message.text.strip())

    # Remove spaces from the phone number before validation/use.
    phone = phone.replace(" ", "")

    if not phone.startswith("+") or not phone[1:].isdigit():
        await message.answer(
            "❌ <b>شمارهٔ تلفن نامعتبر است.</b>\n\n"
            "شماره را با + و کد کشور ارسال کنید.\n"
            "مثال:\n"
            "<code>+989123456789</code>"
        )
        return

    account = await _get_or_create_account(telegram_user_id)

    try:
        phone_code_hash = await user_client_manager.start_login(
            account.id,
            account.session_name,
            phone,
        )

    except PhoneNumberInvalidError:
        await message.answer(
            "❌ Telegram این شمارهٔ تلفن را معتبر نمی‌داند."
        )
        return

    except FloodWaitError as exc:
        await message.answer(
            "⏳ Telegram فعلاً درخواست ورود جدید را محدود کرده است.\n\n"
            f"حدود <b>{exc.seconds}</b> ثانیه صبر کنید."
        )
        return

    except Exception:
        logger.exception(
            "Failed to start Telegram login for user_id=%s",
            telegram_user_id,
        )
        await message.answer(
            "❌ ارسال کد ورود انجام نشد.\n\n"
            "خطای فنی در شروع ورود رخ داده است. "
            "لاگ سرویس Bot را بررسی کنید."
        )
        return

    await state.update_data(
        account_id=account.id,
        session_name=account.session_name,
        phone=phone,
        phone_code_hash=phone_code_hash,
        code_buffer="",
        telegram_user_id=telegram_user_id,
    )

    await state.set_state(AuthStates.code)

    await message.answer(
        code_message(""),
        reply_markup=code_keyboard(),
    )


@router.message(AuthStates.code)
async def reject_text_code(
    message: Message,
) -> None:
    """
    Do not accept login code as a normal text message.
    The code must be entered through the inline keypad.
    """
    if message.from_user is None:
        return

    await message.answer(
        "⚠️ <b>کد ورود را به‌صورت پیام متنی ارسال نکنید.</b>\n\n"
        "برای جلوگیری از مشکل در پردازش کد، "
        "از صفحه‌کلید عددی زیر استفاده کنید."
    )


@router.callback_query(
    AuthStates.code,
    F.data.startswith("auth:digit:"),
)
async def append_digit(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    raw = callback.data.rsplit(":", 1)[-1]

    if raw not in "0123456789":
        await callback.answer(
            "رقم نامعتبر است.",
            show_alert=True,
        )
        return

    data = await state.get_data()
    code = _current_code(data)

    if len(code) >= _CODE_MAX_LENGTH:
        await callback.answer(
            "کد به حداکثر طول مجاز رسیده است.",
            show_alert=True,
        )
        return

    code += raw

    await state.update_data(
        code_buffer=code,
    )

    await _safe_edit_code_prompt(
        callback,
        code,
    )

    await callback.answer()


@router.callback_query(
    AuthStates.code,
    F.data == "auth:delete",
)
async def delete_digit(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    data = await state.get_data()

    code = _current_code(data)
    code = code[:-1]

    await state.update_data(
        code_buffer=code,
    )

    await _safe_edit_code_prompt(
        callback,
        code,
    )

    await callback.answer()


@router.callback_query(
    AuthStates.code,
    F.data == "auth:resend",
)
async def resend_code(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    data = await state.get_data()

    required = (
        "account_id",
        "session_name",
        "phone",
    )

    if not all(data.get(key) for key in required):
        await callback.answer(
            "جلسهٔ ورود منقضی شده است. دوباره اتصال را شروع کنید.",
            show_alert=True,
        )
        await state.clear()
        return

    try:
        phone_code_hash = await user_client_manager.start_login(
            int(data["account_id"]),
            data["session_name"],
            data["phone"],
        )

    except FloodWaitError as exc:
        await callback.answer(
            f"لطفاً {exc.seconds} ثانیه صبر کنید.",
            show_alert=True,
        )
        return

    except Exception:
        logger.exception(
            "Failed to resend Telegram login code for account_id=%s",
            data.get("account_id"),
        )
        await callback.answer(
            "❌ ارسال مجدد کد انجام نشد.",
            show_alert=True,
        )
        return

    await state.update_data(
        phone_code_hash=phone_code_hash,
        code_buffer="",
    )

    await _safe_edit_code_prompt(
        callback,
        "",
        can_resend=True,
    )

    await callback.answer(
        "✅ کد جدید ارسال شد."
    )


@router.callback_query(
    AuthStates.code,
    F.data == "auth:confirm",
)
async def confirm_code(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    data = await state.get_data()
    code = _current_code(data)

    if len(code) < 3:
        await callback.answer(
            "کد هنوز کامل نشده است.",
            show_alert=True,
        )
        return

    required = (
        "account_id",
        "session_name",
        "phone",
        "phone_code_hash",
    )

    if not all(data.get(key) for key in required):
        await callback.answer(
            "جلسهٔ ورود ناقص یا منقضی شده است.",
            show_alert=True,
        )
        await state.clear()
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
        await callback.answer(
            "❌ کد ورود اشتباه است.",
            show_alert=True,
        )
        return

    except PhoneCodeExpiredError:
        await state.update_data(
            code_buffer="",
        )

        await _safe_edit_code_prompt(
            callback,
            "",
            can_resend=True,
        )

        await callback.answer(
            "⏱ کد منقضی شده است؛ کد جدید دریافت کنید.",
            show_alert=True,
        )
        return

    except FloodWaitError as exc:
        await callback.answer(
            f"Telegram درخواست را محدود کرده؛ "
            f"{exc.seconds} ثانیه صبر کنید.",
            show_alert=True,
        )
        return

    except SessionPasswordNeededError:
        ok = False
        result = "PASSWORD_REQUIRED"

    except Exception:
        logger.exception(
            "Failed to finish Telegram login for account_id=%s",
            data.get("account_id"),
        )

        await callback.answer(
            "❌ ورود انجام نشد. لاگ Bot را بررسی کنید.",
            show_alert=True,
        )
        return

    if not ok and result == "PASSWORD_REQUIRED":
        await state.set_state(AuthStates.password)

        if callback.message is not None:
            await callback.message.edit_text(
                "🔒 <b>احراز هویت دو مرحله‌ای</b>\n\n"
                "این اکانت 2FA دارد.\n"
                "رمز 2FA را ارسال کنید."
            )

        await callback.answer()
        return

    if not ok:
        await callback.answer(
            "❌ ورود به اکانت ناموفق بود.",
            show_alert=True,
        )
        await state.clear()
        return

    await _mark_connected(
        data,
        result,
    )

    await state.clear()

    if callback.message is not None:
        await callback.message.edit_text(
            "✅ <b>اکانت با موفقیت متصل شد.</b>\n\n"
            "User Client با موفقیت متصل شد.\n\n"
            "اکانت شما به‌صورت مستقل از سایر کاربران ذخیره شده است.",
            reply_markup=main_keyboard(),
        )

    await callback.answer(
        "✅ اتصال موفق بود."
    )


@router.callback_query(
    AuthStates.code,
    F.data == "auth:cancel",
)
async def cancel_code(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if callback.from_user is None:
        await callback.answer()
        return

    await state.clear()

    if callback.message is not None:
        await callback.message.edit_text(
            "❌ <b>فرایند اتصال اکانت لغو شد.</b>",
            reply_markup=main_keyboard(),
        )

    await callback.answer()


@router.message(AuthStates.password)
async def receive_password(
    message: Message,
    state: FSMContext,
) -> None:
    if message.from_user is None or not message.text:
        return

    data = await state.get_data()

    required = (
        "account_id",
        "session_name",
        "phone",
        "phone_code_hash",
    )

    if not all(data.get(key) for key in required):
        await message.answer(
            "❌ جلسهٔ احراز هویت معتبر نیست.\n"
            "لطفاً اتصال اکانت را دوباره شروع کنید."
        )
        await state.clear()
        return

    password = message.text.strip()

    try:
        ok, result = await user_client_manager.finish_login(
            int(data["account_id"]),
            data["session_name"],
            data["phone"],
            "",
            data["phone_code_hash"],
            password=password,
        )

    except PasswordHashInvalidError:
        await message.answer(
            "❌ رمز 2FA صحیح نیست."
        )
        return

    except FloodWaitError as exc:
        await message.answer(
            "⏳ Telegram محدودیت اعمال کرده است.\n"
            f"حدود <b>{exc.seconds}</b> ثانیه صبر کنید."
        )
        return

    except Exception:
        logger.exception(
            "Failed to finish 2FA login for account_id=%s",
            data.get("account_id"),
        )

        await message.answer(
            "❌ ورود با 2FA انجام نشد.\n"
            "لاگ Bot را بررسی کنید."
        )
        return

    if not ok:
        await message.answer(
            "❌ ورود ناموفق بود."
        )
        return

    await _mark_connected(
        data,
        result,
    )

    await state.clear()

    await message.answer(
        "✅ <b>اکانت با موفقیت متصل شد.</b>\n\n"
        "احراز هویت دو مرحله‌ای با موفقیت انجام شد.\n"
        "اکانت شما آماده استفاده است.",
        reply_markup=main_keyboard(),
    )


async def _mark_connected(
    data: dict,
    result,
) -> None:
    async with SessionLocal() as db:
        account = await db.get(
            Account,
            int(data["account_id"]),
        )

        if account is None:
            raise RuntimeError(
                "Account record not found"
            )

        account.is_connected = True
        account.telegram_user_id = int(result.id)

        phone = str(data.get("phone", ""))
        account.phone_hint = phone[-4:] if phone else None

        await db.commit()
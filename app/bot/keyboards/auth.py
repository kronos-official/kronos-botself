from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def _digit_button(digit: int) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=str(digit),
        callback_data=f"auth:digit:{digit}",
    )


def code_keyboard(code_length: int = 5, *, can_resend: bool = True) -> InlineKeyboardMarkup:
    """Numeric keypad for Telegram login-code entry.

    The code is never sent as a normal Telegram message. Digits are kept in
    the FSM storage and only submitted when the owner presses Confirm.
    """
    rows = [
        [_digit_button(1), _digit_button(2), _digit_button(3)],
        [_digit_button(4), _digit_button(5), _digit_button(6)],
        [_digit_button(7), _digit_button(8), _digit_button(9)],
        [
            InlineKeyboardButton(text="⌫ حذف", callback_data="auth:delete"),
            _digit_button(0),
            InlineKeyboardButton(text="✅ تایید", callback_data="auth:confirm"),
        ],
    ]

    controls = [
        InlineKeyboardButton(text="✖️ لغو", callback_data="auth:cancel"),
    ]
    if can_resend:
        controls.insert(
            0,
            InlineKeyboardButton(text="🔄 کد جدید", callback_data="auth:resend"),
        )
    rows.append(controls)

    return InlineKeyboardMarkup(inline_keyboard=rows)


def code_message(code: str, *, can_resend: bool = True) -> str:
    masked = code if code else "—"
    return (
        "🔐 <b>کد ورود Telegram</b>\n\n"
        "کد ارسال‌شده را فقط با دکمه‌های زیر وارد کنید.\n"
        "این ربات کد را به‌صورت پیام متنی دریافت نمی‌کند.\n\n"
        f"<b>کد:</b> <code>{masked}</code>\n\n"
        "بعد از کامل شدن کد، دکمهٔ <b>✅ تایید</b> را بزنید."
    )

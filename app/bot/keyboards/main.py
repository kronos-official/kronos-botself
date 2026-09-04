from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.core.config import get_settings


def miniapp_button() -> InlineKeyboardMarkup:
    settings = get_settings()
    if not settings.webapp_url:
        return InlineKeyboardMarkup(inline_keyboard=[])
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 باز کردن پنل Kronos Self",
                    web_app=WebAppInfo(url=settings.miniapp_url),
                )
            ]
        ]
    )


def back_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ بازگشت", callback_data="back:main")]
        ]
    )


def main_keyboard() -> InlineKeyboardMarkup:
    settings = get_settings()
    rows: list[list[InlineKeyboardButton]] = []

    if settings.webapp_url:
        rows.append(
            [
                InlineKeyboardButton(
                    text="🚀 پنل Kronos Self",
                    web_app=WebAppInfo(url=settings.miniapp_url),
                )
            ]
        )

    rows.extend(
        [
            [InlineKeyboardButton(text="🔐 اتصال اکانت", callback_data="account:connect")],
            [
                InlineKeyboardButton(text="🎯 مقصدها", callback_data="destinations:list"),
                InlineKeyboardButton(text="⏰ زمان‌بندی‌ها", callback_data="schedules:list"),
            ],
            [
                InlineKeyboardButton(text="📊 وضعیت", callback_data="status"),
                InlineKeyboardButton(text="🎫 پشتیبانی", callback_data="support:info"),
            ],
            [InlineKeyboardButton(text="📋 راهنما", callback_data="help")],
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)

from aiogram import F, Router
from aiogram.types import CallbackQuery
from sqlalchemy import select

from app.bot.keyboards.main import back_menu
from app.db.models import Account
from app.db.session import SessionLocal
from app.userbot import user_client_manager


router = Router()


@router.callback_query(F.data == "destinations:list")
async def list_destinations(callback: CallbackQuery) -> None:
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

        if not account or not account.is_connected:
            await callback.message.edit_text(
                "ابتدا اکانت User Client را متصل کنید.",
                reply_markup=back_menu(),
            )
            await callback.answer()
            return

        try:
            dialogs = await user_client_manager.sync_dialogs(
                account.id,
                account.session_name,
            )
        except Exception:
            await callback.message.edit_text(
                "❌ همگام‌سازی مقصدها انجام نشد.",
                reply_markup=back_menu(),
            )
            await callback.answer()
            return

        rows = [
            "🎯 <b>مقصدها</b>",
            "",
        ]

        for item in dialogs[:30]:
            username = (
                f" @{item['username']}"
                if item.get("username")
                else ""
            )

            rows.append(
                f"• {item['title']}{username}"
                f" — <code>{item['peer_id']}</code>"
            )

        rows.append("")
        rows.append(
            "برای مدیریت کامل مقصدها از Mini App استفاده کنید."
        )

        await callback.message.edit_text(
            "\n".join(rows),
            reply_markup=back_menu(),
        )

    await callback.answer()

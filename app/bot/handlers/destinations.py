from aiogram import F, Router
from aiogram.types import CallbackQuery
from sqlalchemy import select

from app.bot.keyboards.main import back_menu
from app.core.config import get_settings
from app.db.models import Account, Destination
from app.db.session import SessionLocal
from app.userbot import user_client_manager

router = Router()


@router.callback_query(F.data == "destinations:list")
async def list_destinations(callback: CallbackQuery) -> None:
    settings = get_settings()
    if not callback.from_user or callback.from_user.id != settings.owner_telegram_id:
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    async with SessionLocal() as db:
        account = (
            await db.execute(
                select(Account).where(Account.owner_telegram_id == settings.owner_telegram_id)
            )
        ).scalar_one_or_none()
        if not account or not account.is_connected:
            await callback.message.edit_text(
                "ابتدا اکانت User Client را متصل کنید.",
                reply_markup=back_menu(),
            )
            await callback.answer()
            return

        dialogs = await user_client_manager.sync_dialogs(account.id, account.session_name)
        rows = ["🎯 <b>مقصدها</b>", ""]
        for item in dialogs[:30]:
            username = f" @{item['username']}" if item.get("username") else ""
            rows.append(
                f"• {item['title']}{username} — <code>{item['peer_id']}</code>"
            )
        rows.append("\nبرای مدیریت کامل مقصدها از Mini App استفاده کنید.")
        await callback.message.edit_text("\n".join(rows), reply_markup=back_menu())
    await callback.answer()

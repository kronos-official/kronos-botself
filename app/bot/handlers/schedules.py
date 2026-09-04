from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from datetime import datetime, timedelta, timezone
from sqlalchemy import select

from app.bot.keyboards.main import back_menu
from app.bot.states import ScheduleStates
from app.core.config import get_settings
from app.db.models import Account, Destination, Schedule
from app.db.session import SessionLocal

router = Router()


@router.callback_query(F.data == "schedules:list")
async def schedules_list(callback: CallbackQuery) -> None:
    settings = get_settings()
    if not callback.from_user or callback.from_user.id != settings.owner_telegram_id:
        await callback.answer("دسترسی ندارید.", show_alert=True)
        return

    async with SessionLocal() as db:
        schedules = (
            await db.execute(select(Schedule).order_by(Schedule.id.desc()).limit(30))
        ).scalars().all()
        if not schedules:
            text = "⏰ هنوز زمان‌بندی‌ای ثبت نشده است."
        else:
            rows = ["⏰ <b>زمان‌بندی‌ها</b>", ""]
            for item in schedules:
                rows.append(
                    f"#{item.id} | {item.schedule_type} | "
                    f"{'✅' if item.enabled else '⏸'} | next={item.next_run_at}"
                )
            text = "\n".join(rows)
    await callback.message.edit_text(text, reply_markup=back_menu())
    await callback.answer()


@router.message(Command("new_schedule"))
async def new_schedule(message: Message, state: FSMContext) -> None:
    settings = get_settings()
    if not message.from_user or message.from_user.id != settings.owner_telegram_id:
        return
    await state.set_state(ScheduleStates.target)
    await message.answer("ID مقصد تلگرام را بفرستید. مثال: -1001234567890")


@router.message(ScheduleStates.target)
async def schedule_target(message: Message, state: FSMContext) -> None:
    try:
        target_id = int((message.text or "").strip())
    except ValueError:
        await message.answer("❌ شناسه مقصد باید عددی باشد.")
        return
    await state.update_data(target_id=target_id)
    await state.set_state(ScheduleStates.text)
    await message.answer("متن پیام را بفرستید.")


@router.message(ScheduleStates.text)
async def schedule_text(message: Message, state: FSMContext) -> None:
    text = (message.text or "").strip()
    if not text:
        await message.answer("❌ متن نمی‌تواند خالی باشد.")
        return
    await state.update_data(text=text)
    await state.set_state(ScheduleStates.interval)
    await message.answer("فاصله ارسال را به ثانیه بفرستید. حداقل 60 ثانیه.")


@router.message(ScheduleStates.interval)
async def schedule_interval(message: Message, state: FSMContext) -> None:
    try:
        seconds = int((message.text or "").strip())
    except ValueError:
        await message.answer("❌ فاصله باید عدد باشد.")
        return
    if seconds < 60:
        await message.answer("❌ حداقل فاصله 60 ثانیه است.")
        return

    data = await state.get_data()
    settings = get_settings()
    now = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        account = (
            await db.execute(
                select(Account).where(Account.owner_telegram_id == settings.owner_telegram_id)
            )
        ).scalar_one_or_none()
        if not account or not account.is_connected:
            await state.clear()
            await message.answer("❌ ابتدا اکانت را متصل کنید.")
            return

        destination = (
            await db.execute(
                select(Destination).where(
                    Destination.account_id == account.id,
                    Destination.telegram_peer_id == data["target_id"],
                )
            )
        ).scalar_one_or_none()
        if destination is None:
            destination = Destination(
                account_id=account.id,
                telegram_peer_id=data["target_id"],
                title=str(data["target_id"]),
                kind="unknown",
            )
            db.add(destination)
            await db.flush()

        schedule = Schedule(
            account_id=account.id,
            destination_id=destination.id,
            content_type="text",
            payload={"type": "text", "text": data["text"]},
            schedule_type="interval",
            interval_seconds=seconds,
            next_run_at=now + timedelta(seconds=seconds),
            enabled=True,
        )
        db.add(schedule)
        await db.commit()
        await db.refresh(schedule)

    await state.clear()
    await message.answer(
        f"✅ زمان‌بندی #{schedule.id} ایجاد شد.",
        reply_markup=back_menu(),
    )

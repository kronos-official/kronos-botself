from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.main import db, get_user_account, require_user
from app.db.models import AutoClickSetting, Destination
from app.services.autoclick import (
    ACTION_SELL,
    ALLOWED_ACTIONS,
    MAX_INTERVAL_SECONDS,
    MIN_INTERVAL_SECONDS,
)

router = APIRouter(
    prefix="/api/autoclick",
    tags=["autoclick"],
)


class AutoClickUpdate(BaseModel):
    group_destination_id: int | None = None

    enabled: bool = False

    selected_action: str = Field(
        default=ACTION_SELL,
        max_length=64,
    )

    interval_seconds: int = Field(
        default=10,
        ge=MIN_INTERVAL_SECONDS,
        le=MAX_INTERVAL_SECONDS,
    )

    @field_validator("selected_action")
    @classmethod
    def validate_action(cls, value: str) -> str:
        if value not in ALLOWED_ACTIONS:
            raise ValueError(
                "Invalid AutoClick action"
            )

        return value


def serialize_autoclick(
    setting: AutoClickSetting | None,
) -> dict:
    if setting is None:
        return {
            "configured": False,
            "enabled": False,
            "group": None,
            "selected_action": ACTION_SELL,
            "interval_seconds": 10,
            "bot_username": "MeowieQBot",
        }

    return {
        "configured": (
            setting.group_peer_id is not None
        ),
        "enabled": bool(setting.enabled),
        "group": (
            {
                "peer_id": setting.group_peer_id,
                "title": setting.group_title,
                "username": setting.group_username,
            }
            if setting.group_peer_id is not None
            else None
        ),
        "selected_action": setting.selected_action,
        "interval_seconds": int(
            setting.interval_seconds or 10
        ),
        "bot_username": setting.bot_username,
    }


async def _load_setting(
    account_id: int,
    session: AsyncSession,
):
    result = await session.execute(
        select(AutoClickSetting).where(
            AutoClickSetting.account_id == account_id
        )
    )

    return result.scalar_one_or_none()


@router.get("")
async def get_autoclick(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        return serialize_autoclick(None)

    setting = await _load_setting(
        account.id,
        session,
    )

    return serialize_autoclick(setting)


@router.put("")
async def update_autoclick(
    body: AutoClickUpdate,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict:
    account = await get_user_account(
        telegram_user_id,
        session,
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    if not account.is_connected:
        raise HTTPException(
            status_code=409,
            detail="Account is not connected",
        )

    group = None

    if body.group_destination_id is not None:
        group = await session.get(
            Destination,
            body.group_destination_id,
        )

        if (
            not group
            or group.account_id != account.id
            or not group.enabled
            or group.kind != "group"
        ):
            raise HTTPException(
                status_code=404,
                detail="Group destination not found",
            )

    setting = await _load_setting(
        account.id,
        session,
    )

    if setting is None:
        setting = AutoClickSetting(
            account_id=account.id,
            enabled=False,
            interval_seconds=body.interval_seconds,
            selected_action=body.selected_action,
            bot_username="MeowieQBot",
        )

        session.add(setting)

    setting.selected_action = body.selected_action
    setting.interval_seconds = body.interval_seconds
    setting.bot_username = "MeowieQBot"

    if group is None:
        setting.group_peer_id = None
        setting.group_title = None
        setting.group_username = None
        setting.enabled = False
    else:
        setting.group_peer_id = group.telegram_peer_id
        setting.group_title = group.title
        setting.group_username = group.username
        setting.enabled = bool(body.enabled)

    await session.commit()
    await session.refresh(setting)

    return serialize_autoclick(setting)
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AutoClickSetting, Destination
from app.services.autoclick import (
    ACTION_SELL,
    ALLOWED_ACTIONS,
    AutoClickButtonNotFound,
    AutoClickBusy,
    AutoClickError,
    AutoClickNotFound,
    AutoClickUnauthorized,
    execute_autoclick,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/autoclick", tags=["autoclick"])


class AutoClickUpdate(BaseModel):
    group_destination_id: int | None = None
    enabled: bool = False
    selected_action: str = Field(default=ACTION_SELL, max_length=64)


class AutoClickExecute(BaseModel):
    action: str | None = Field(default=None, max_length=64)


def _deps():
    # Imported lazily so the API router can be mounted by wrapper.py without
    # introducing a circular import during app.api.main initialization.
    from app.api.main import db, get_user_account, require_user

    return db, get_user_account, require_user


def serialize_autoclick(setting: AutoClickSetting | None) -> dict:
    if setting is None:
        return {
            "configured": False,
            "enabled": False,
            "group": None,
            "selected_action": ACTION_SELL,
            "bot_username": "MeowieQBot",
        }

    return {
        "configured": setting.group_peer_id is not None,
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
        "bot_username": setting.bot_username,
    }


async def _load_setting(account_id: int, session: AsyncSession):
    result = await session.execute(
        select(AutoClickSetting).where(
            AutoClickSetting.account_id == account_id
        )
    )
    return result.scalar_one_or_none()


@router.get("")
async def get_autoclick():
    db, get_user_account, require_user = _deps()
    telegram_user_id: int = await require_user()
    async for session in db():
        account = await get_user_account(telegram_user_id, session)
        if not account:
            return serialize_autoclick(None)
        setting = await _load_setting(account.id, session)
        return serialize_autoclick(setting)


@router.put("")
async def update_autoclick(body: AutoClickUpdate):
    db, get_user_account, require_user = _deps()
    telegram_user_id: int = await require_user()

    if body.selected_action not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=422, detail="Invalid AutoClick action")

    async for session in db():
        account = await get_user_account(telegram_user_id, session)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        if not account.is_connected:
            raise HTTPException(status_code=409, detail="Account is not connected")

        group = None
        if body.group_destination_id is not None:
            group = await session.get(Destination, body.group_destination_id)
            if (
                not group
                or group.account_id != account.id
                or not group.enabled
                or group.kind != "group"
            ):
                raise HTTPException(status_code=404, detail="Group destination not found")

        setting = await _load_setting(account.id, session)
        if setting is None:
            setting = AutoClickSetting(
                account_id=account.id,
                enabled=False,
                selected_action=body.selected_action,
                bot_username="MeowieQBot",
            )
            session.add(setting)

        setting.selected_action = body.selected_action
        setting.bot_username = "MeowieQBot"

        if group is None:
            setting.group_peer_id = None
            setting.group_title = None
            setting.group_username = None
        else:
            setting.group_peer_id = group.telegram_peer_id
            setting.group_title = group.title
            setting.group_username = group.username

        setting.enabled = bool(body.enabled and group is not None)
        await session.commit()
        await session.refresh(setting)
        return serialize_autoclick(setting)


@router.post("/execute")
async def execute_autoclick_api(body: AutoClickExecute):
    db, get_user_account, require_user = _deps()
    telegram_user_id: int = await require_user()

    async for session in db():
        account = await get_user_account(telegram_user_id, session)
        if not account or not account.is_connected:
            raise HTTPException(status_code=409, detail="Account is not connected")

        setting = await _load_setting(account.id, session)
        if not setting:
            raise HTTPException(status_code=409, detail="AutoClick is not configured")
        if not setting.group_peer_id:
            raise HTTPException(status_code=409, detail="AutoClick group is not configured")
        if not setting.enabled:
            raise HTTPException(status_code=409, detail="AutoClick is disabled")

        action = body.action or setting.selected_action
        if action not in ALLOWED_ACTIONS:
            raise HTTPException(status_code=422, detail="Invalid AutoClick action")

        try:
            result = await execute_autoclick(
                account_id=account.id,
                session_name=account.session_name,
                group_id=setting.group_peer_id,
                action=action,
            )
        except AutoClickUnauthorized as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except AutoClickBusy as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except AutoClickNotFound as exc:
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        except AutoClickButtonNotFound as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except AutoClickError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Unexpected AutoClick error for account_id=%s", account.id)
            raise HTTPException(status_code=502, detail="AutoClick execution failed") from exc

        return {
            "ok": True,
            "group": {
                "peer_id": result.group_id,
                "title": setting.group_title,
                "username": setting.group_username,
            },
            "action": result.action,
            "trigger_message_id": result.trigger_message_id,
            "menu_message_id": result.menu_message_id,
            "clicked_button": result.clicked_button,
            "elapsed_ms": result.elapsed_ms,
        }

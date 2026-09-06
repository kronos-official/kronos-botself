from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.main import db, get_user_account, require_user
from app.services.meowie_game import MEOWIE_SETTING_TABLE, default_settings

router = APIRouter(prefix="/api/meowie", tags=["meowie"])


class ProductConfig(BaseModel):
    enabled: bool = False
    product: str = Field(min_length=1, max_length=100)
    percentage: int = Field(default=25)

    @field_validator("percentage")
    @classmethod
    def valid_percentage(cls, value: int) -> int:
        if value not in {25, 50, 75, 100}:
            raise ValueError("Percentage must be 25, 50, 75 or 100")
        return value


class MeowieUpdate(BaseModel):
    enabled: bool = False
    group_destination_id: int | None = None
    meow_enabled: bool = False
    meow_retry_seconds: int = Field(default=30, ge=5, le=3600)
    cat_enabled: bool = False
    cat_collect_enabled: bool = False
    cat_collect_interval_seconds: int = Field(default=300, ge=10, le=86400)
    cat_upgrade_enabled: bool = False
    cat_upgrade_retry_seconds: int = Field(default=300, ge=10, le=86400)
    factory_enabled: bool = False
    factory_storage_upgrade: bool = False
    factory_workers_upgrade: bool = False
    factory_machines_upgrade: bool = False
    factory_products: list[ProductConfig] = Field(default_factory=list, max_length=4)


async def _get_setting(account_id: int, session: AsyncSession) -> dict[str, Any] | None:
    result = await session.execute(
        select(MEOWIE_SETTING_TABLE).where(MEOWIE_SETTING_TABLE.c.account_id == account_id)
    )
    row = result.mappings().first()
    return dict(row) if row else None


def serialize(row: dict[str, Any] | None) -> dict[str, Any]:
    data = default_settings() if row is None else dict(row)
    data.pop("created_at", None)
    data.pop("updated_at", None)
    data.pop("account_id", None)
    return data


@router.get("")
async def get_meowie(
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict[str, Any]:
    account = await get_user_account(telegram_user_id, session)
    if not account:
        return serialize(None)
    return serialize(await _get_setting(account.id, session))


@router.put("")
async def update_meowie(
    body: MeowieUpdate,
    telegram_user_id: int = Depends(require_user),
    session: AsyncSession = Depends(db),
) -> dict[str, Any]:
    account = await get_user_account(telegram_user_id, session)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if not account.is_connected:
        raise HTTPException(status_code=409, detail="Account is not connected")

    from app.db.models import Destination

    group = None
    if body.group_destination_id is not None:
        group = await session.get(Destination, body.group_destination_id)
        if not group or group.account_id != account.id or not group.enabled or group.kind != "group":
            raise HTTPException(status_code=404, detail="Group destination not found")

    payload = {
        "enabled": bool(body.enabled and group is not None),
        "group_peer_id": int(group.telegram_peer_id) if group else None,
        "group_title": group.title if group else None,
        "group_username": group.username if group else None,
        "meow_enabled": body.meow_enabled,
        "meow_retry_seconds": body.meow_retry_seconds,
        "cat_enabled": body.cat_enabled,
        "cat_collect_enabled": body.cat_collect_enabled,
        "cat_collect_interval_seconds": body.cat_collect_interval_seconds,
        "cat_upgrade_enabled": body.cat_upgrade_enabled,
        "cat_upgrade_retry_seconds": body.cat_upgrade_retry_seconds,
        "factory_enabled": body.factory_enabled,
        "factory_storage_upgrade": body.factory_storage_upgrade,
        "factory_workers_upgrade": body.factory_workers_upgrade,
        "factory_machines_upgrade": body.factory_machines_upgrade,
        "factory_products": [item.model_dump() for item in body.factory_products],
    }

    existing = await _get_setting(account.id, session)
    if existing is None:
        await session.execute(MEOWIE_SETTING_TABLE.insert().values(account_id=account.id, **payload))
    else:
        await session.execute(
            MEOWIE_SETTING_TABLE.update()
            .where(MEOWIE_SETTING_TABLE.c.account_id == account.id)
            .values(**payload)
        )

    await session.commit()
    return serialize(await _get_setting(account.id, session))

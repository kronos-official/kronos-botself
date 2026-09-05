from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from telethon import TelegramClient
from telethon.errors import RPCError
from telethon.tl.types import Channel, Chat, User

from app.core.config import get_settings


class UserClientManager:
    """Own and lifecycle-manage one Telethon client per account."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._clients: dict[int, TelegramClient] = {}
        self._locks: dict[int, asyncio.Lock] = {}
        self._login_locks: dict[int, asyncio.Lock] = {}

        Path(self.settings.sessions_dir).mkdir(
            parents=True,
            exist_ok=True,
        )

    def _lock(self, account_id: int) -> asyncio.Lock:
        return self._locks.setdefault(account_id, asyncio.Lock())

    def _login_lock(self, account_id: int) -> asyncio.Lock:
        return self._login_locks.setdefault(account_id, asyncio.Lock())

    def _session_path(self, session_name: str) -> str:
        safe_name = Path(session_name).name
        if safe_name != session_name or not safe_name:
            raise ValueError("Invalid session name")

        root = Path(self.settings.sessions_dir).resolve()
        candidate = (root / safe_name).resolve()
        if root not in candidate.parents and candidate != root:
            raise ValueError("Invalid session path")
        return str(candidate)

    def client_for(
        self,
        account_id: int,
        session_name: str,
    ) -> TelegramClient:
        client = self._clients.get(account_id)
        if client is None:
            client = TelegramClient(
                self._session_path(session_name),
                self.settings.api_id,
                self.settings.api_hash,
                device_model="Kronos Self",
                app_version="1.5.0",
                system_version="Kronos Self",
            )
            self._clients[account_id] = client
        return client

    async def connect(
        self,
        account_id: int,
        session_name: str,
    ) -> TelegramClient:
        client = self.client_for(account_id, session_name)
        async with self._lock(account_id):
            if not client.is_connected():
                await client.connect()
        return client

    async def start_login(
        self,
        account_id: int,
        session_name: str,
        phone: str,
    ) -> str:
        async with self._login_lock(account_id):
            client = await self.connect(account_id, session_name)

            if await client.is_user_authorized():
                raise RuntimeError("Telegram session is already authorized")

            sent = await client.send_code_request(phone)
            return sent.phone_code_hash

    async def finish_login(
        self,
        account_id: int,
        session_name: str,
        phone: str,
        code: str,
        phone_code_hash: str,
        password: str | None = None,
    ) -> tuple[bool, Any]:
        """Finish the existing authorization attempt without restarting it during 2FA."""
        async with self._login_lock(account_id):
            client = await self.connect(account_id, session_name)

            if password is not None:
                user = await client.sign_in(password=password)
                return True, user

            user = await client.sign_in(
                phone=phone,
                code=code,
                phone_code_hash=phone_code_hash,
            )
            return True, user

    async def is_authorized(
        self,
        account_id: int,
        session_name: str,
    ) -> bool:
        try:
            client = await self.connect(account_id, session_name)
            return bool(await client.is_user_authorized())
        except (OSError, RPCError):
            return False

    async def disconnect_account(
        self,
        account_id: int,
        session_name: str,
        *,
        delete_session: bool = False,
    ) -> None:
        """Disconnect one account and optionally remove only its own local session files."""
        async with self._lock(account_id):
            client = self._clients.pop(account_id, None)
            if client is not None and client.is_connected():
                try:
                    await client.disconnect()
                except (OSError, RPCError):
                    pass

            if delete_session:
                root = Path(self.settings.sessions_dir).resolve()
                session_path = Path(self._session_path(session_name)).resolve()
                if root not in session_path.parents:
                    raise ValueError("Refusing to delete session outside configured directory")

                candidates = {
                    session_path,
                    Path(str(session_path) + ".session"),
                    Path(str(session_path) + ".session-journal"),
                    Path(str(session_path) + ".session-shm"),
                    Path(str(session_path) + ".session-wal"),
                }
                for candidate in candidates:
                    resolved = candidate.resolve()
                    if root in resolved.parents and resolved.is_file():
                        resolved.unlink(missing_ok=True)

    async def sync_dialogs(
        self,
        account_id: int,
        session_name: str,
    ) -> list[dict[str, Any]]:
        client = await self.connect(account_id, session_name)

        if not await client.is_user_authorized():
            raise RuntimeError("Telegram user session is not authorized")

        result: list[dict[str, Any]] = []

        async for dialog in client.iter_dialogs():
            entity = dialog.entity

            if isinstance(entity, User):
                if getattr(entity, "bot", False):
                    kind = "bot"
                elif getattr(entity, "deleted", False):
                    continue
                else:
                    kind = "pm"
            elif isinstance(entity, Channel):
                kind = "channel" if getattr(entity, "broadcast", False) else "group"
            elif isinstance(entity, Chat):
                kind = "group"
            else:
                kind = "other"

            result.append(
                {
                    "peer_id": int(dialog.id),
                    "title": dialog.title or str(dialog.id),
                    "username": getattr(entity, "username", None),
                    "kind": kind,
                    "verified": bool(getattr(entity, "verified", False)),
                }
            )

        return result

    async def send(
        self,
        account_id: int,
        session_name: str,
        target: int | str,
        payload: dict[str, Any],
    ):
        client = await self.connect(account_id, session_name)

        if not await client.is_user_authorized():
            raise RuntimeError("Telegram user session is not authorized")

        kind = str(payload.get("type", "text"))

        if kind == "text":
            text = str(payload.get("text", "")).strip()
            if not text:
                raise ValueError("Text message is empty")
            return await client.send_message(
                target,
                text,
                parse_mode=payload.get("parse_mode"),
            )

        file_path = payload.get("file_path")
        if not file_path:
            raise ValueError("Media file is missing")

        media_root = Path(self.settings.media_dir).resolve()
        candidate = Path(str(file_path)).resolve()

        if candidate == media_root or media_root not in candidate.parents:
            raise ValueError("Media path is outside the configured media directory")
        if not candidate.is_file():
            raise FileNotFoundError("Media file no longer exists")

        return await client.send_file(
            target,
            str(candidate),
            caption=payload.get("caption"),
            force_document=kind == "document",
            supports_streaming=kind == "video",
        )

    async def disconnect_all(self) -> None:
        account_ids = tuple(self._clients.keys())
        for account_id in account_ids:
            try:
                client = self._clients.get(account_id)
                if client is not None and client.is_connected():
                    await client.disconnect()
            except (OSError, RPCError):
                pass

        self._clients.clear()


user_client_manager = UserClientManager()

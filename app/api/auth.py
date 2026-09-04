from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from app.core.config import get_settings


class TelegramWebAppAuthError(ValueError):
    pass


def validate_telegram_webapp_init_data(init_data: str) -> dict:
    settings = get_settings()
    if not init_data:
        raise TelegramWebAppAuthError("Missing Telegram WebApp initData")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received = pairs.pop("hash", None)
    if not received:
        raise TelegramWebAppAuthError("Missing Telegram WebApp hash")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(pairs.items())
    )
    secret_key = hmac.new(
        b"WebAppData",
        settings.bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise TelegramWebAppAuthError("Invalid Telegram WebApp initData")

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError as exc:
        raise TelegramWebAppAuthError("Invalid auth_date") from exc
    if auth_date <= 0 or abs(int(time.time()) - auth_date) > 86400:
        raise TelegramWebAppAuthError("Expired Telegram WebApp initData")

    try:
        user = json.loads(pairs.get("user", "{}"))
    except json.JSONDecodeError as exc:
        raise TelegramWebAppAuthError("Invalid Telegram user payload") from exc

    if int(user.get("id", 0)) != settings.owner_telegram_id:
        raise TelegramWebAppAuthError("Not owner")
    return user

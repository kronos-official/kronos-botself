from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from app.core.config import get_settings


class TelegramWebAppAuthError(ValueError):
    """Raised when Telegram Mini App initData cannot be trusted."""


def validate_telegram_webapp_init_data(init_data: str) -> dict:
    settings = get_settings()

    if not init_data:
        raise TelegramWebAppAuthError(
            "Missing Telegram WebApp initData"
        )

    pairs = dict(
        parse_qsl(
            init_data,
            keep_blank_values=True,
        )
    )

    received_hash = pairs.pop(
        "hash",
        None,
    )

    if not received_hash:
        raise TelegramWebAppAuthError(
            "Missing Telegram WebApp hash"
        )

    data_check_string = "\n".join(
        f"{key}={value}"
        for key, value in sorted(
            pairs.items()
        )
    )

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=settings.bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()

    expected_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(
        expected_hash,
        received_hash,
    ):
        raise TelegramWebAppAuthError(
            "Invalid Telegram WebApp initData"
        )

    try:
        auth_date = int(
            pairs.get(
                "auth_date",
                "0",
            )
        )
    except ValueError as exc:
        raise TelegramWebAppAuthError(
            "Invalid auth_date"
        ) from exc

    if auth_date <= 0:
        raise TelegramWebAppAuthError(
            "Invalid auth_date"
        )

    max_age = 15 * 60
    current_time = int(time.time())

    if abs(current_time - auth_date) > max_age:
        raise TelegramWebAppAuthError(
            "Expired Telegram WebApp initData"
        )

    raw_user = pairs.get("user")

    if not raw_user:
        raise TelegramWebAppAuthError(
            "Missing Telegram user payload"
        )

    try:
        user = json.loads(raw_user)
    except json.JSONDecodeError as exc:
        raise TelegramWebAppAuthError(
            "Invalid Telegram user payload"
        ) from exc

    try:
        telegram_user_id = int(
            user.get(
                "id",
                0,
            )
        )
    except (TypeError, ValueError) as exc:
        raise TelegramWebAppAuthError(
            "Invalid Telegram user id"
        ) from exc

    if telegram_user_id <= 0:
        raise TelegramWebAppAuthError(
            "Invalid Telegram user id"
        )

    user["id"] = telegram_user_id

    return user

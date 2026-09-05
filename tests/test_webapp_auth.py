from __future__ import annotations

import hashlib
import hmac
import json
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest

import app.api.auth as auth


def _signed_init_data(
    bot_token: str,
    *,
    telegram_user_id: int = 123456789,
    auth_date: int,
    received_hash: str | None = None,
) -> str:
    user = {
        "id": telegram_user_id,
        "first_name": "Test",
        "username": "test_user",
    }

    pairs = {
        "auth_date": str(auth_date),
        "query_id": "test-query",
        "user": json.dumps(
            user,
            separators=(",", ":"),
        ),
    }

    data_check_string = "\n".join(
        f"{key}={value}"
        for key, value in sorted(pairs.items())
    )

    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return urlencode(
        {
            **pairs,
            "hash": received_hash or calculated_hash,
        }
    )


def test_webapp_auth_accepts_valid_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot_token = "x" * 40
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(
            bot_token=bot_token,
        ),
    )
    monkeypatch.setattr(
        auth.time,
        "time",
        lambda: 1_700_000_100,
    )

    init_data = _signed_init_data(
        bot_token,
        auth_date=1_700_000_050,
    )

    user = auth.validate_telegram_webapp_init_data(
        init_data
    )

    assert user["id"] == 123456789
    assert user["username"] == "test_user"


def test_webapp_auth_rejects_invalid_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot_token = "x" * 40
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(
            bot_token=bot_token,
        ),
    )
    monkeypatch.setattr(
        auth.time,
        "time",
        lambda: 1_700_000_100,
    )

    init_data = _signed_init_data(
        bot_token,
        auth_date=1_700_000_050,
        received_hash="0" * 64,
    )

    with pytest.raises(
        auth.TelegramWebAppAuthError,
        match="Invalid Telegram WebApp initData",
    ):
        auth.validate_telegram_webapp_init_data(
            init_data
        )


def test_webapp_auth_rejects_expired_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot_token = "x" * 40
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(
            bot_token=bot_token,
        ),
    )
    monkeypatch.setattr(
        auth.time,
        "time",
        lambda: 1_700_100_100,
    )

    init_data = _signed_init_data(
        bot_token,
        auth_date=1_700_000_050,
    )

    with pytest.raises(
        auth.TelegramWebAppAuthError,
        match="Expired Telegram WebApp initData",
    ):
        auth.validate_telegram_webapp_init_data(
            init_data
        )

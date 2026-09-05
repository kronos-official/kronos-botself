from app.services.autoclick import (
    ACTION_FEED,
    ACTION_FRIDGE,
    ACTION_SELL,
    ALLOWED_ACTIONS,
    button_matches,
    normalize_button_text,
)


def test_normalize_button_text_handles_rtl_and_arabic_variants():
    assert normalize_button_text("  فروش ماهی\u200f  ") == ACTION_SELL
    assert normalize_button_text("بده پیشی بخوره") == ACTION_FEED
    assert normalize_button_text("بندازش توی یخچال") == ACTION_FRIDGE
    assert normalize_button_text("ك") == "ک"
    assert normalize_button_text("ي") == "ی"


def test_button_matches_normalizes_unicode_variants():
    assert button_matches(" فروش ماهی\u200e", ACTION_SELL)
    assert button_matches("فروش ماهی", " فروش ماهی ")
    assert not button_matches("فروش ماهی", ACTION_FEED)


def test_allowed_actions_are_exactly_supported_actions():
    assert ALLOWED_ACTIONS == {ACTION_SELL, ACTION_FEED, ACTION_FRIDGE}

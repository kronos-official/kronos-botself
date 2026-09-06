from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


PERSIAN_DIGITS = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹",
    "0123456789",
)

ARABIC_DIGITS = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩",
    "0123456789",
)


def normalize_text(value: str | None) -> str:
    if not value:
        return ""

    text = unicodedata.normalize(
        "NFKC",
        str(value),
    )

    return (
        text.translate(PERSIAN_DIGITS)
        .translate(ARABIC_DIGITS)
        .replace("\u200c", "")
        .replace("\u200f", "")
        .replace("\u200e", "")
        .replace("\u2060", "")
        .replace("ي", "ی")
        .replace("ى", "ی")
        .replace("ك", "ک")
        .replace("ۀ", "ه")
        .replace("ة", "ه")
        .replace("ـ", "")
        .replace("\uFE0F", "")
        .strip()
    )


def compact_text(value: str | None) -> str:
    return re.sub(
        r"\s+",
        " ",
        normalize_text(value),
    ).strip()


def extract_numbers(value: str | None) -> list[int]:
    text = normalize_text(value)

    values: list[int] = []

    for raw in re.findall(
        r"(?<![\d.])\d[\d,\.\s]*(?![\d.])",
        text,
    ):
        cleaned = (
            raw.replace(",", "")
            .replace(".", "")
            .replace(" ", "")
        )

        if cleaned.isdigit():
            values.append(int(cleaned))

    return values


def extract_first_number(
    value: str | None,
) -> int | None:
    numbers = extract_numbers(value)

    if not numbers:
        return None

    return numbers[0]


def parse_duration(value: str | None) -> int | None:
    if not value:
        return None

    text = normalize_text(value)

    patterns = [
        (
            r"(?<!\d)(\d{1,3}):(\d{1,2}):(\d{1,2})(?!\d)",
            3,
        ),
        (
            r"(?<!\d)(\d{1,3}):(\d{1,2})(?!\d)",
            2,
        ),
    ]

    for pattern, parts in patterns:
        match = re.search(
            pattern,
            text,
        )

        if not match:
            continue

        values = [
            int(item)
            for item in match.groups()
        ]

        if parts == 3:
            hours, minutes, seconds = values

            if (
                minutes > 59
                or seconds > 59
            ):
                continue

            return (
                hours * 3600
                + minutes * 60
                + seconds
            )

        minutes, seconds = values

        if seconds > 59:
            continue

        return (
            minutes * 60
            + seconds
        )

    return None


def find_time_after_keywords(
    text: str,
    keywords: tuple[str, ...],
) -> int | None:
    normalized = normalize_text(text)

    for keyword in keywords:
        position = normalized.find(
            normalize_text(keyword)
        )

        if position < 0:
            continue

        fragment = normalized[
            position:
            position + 160
        ]

        duration = parse_duration(
            fragment
        )

        if duration is not None:
            return duration

    return None


@dataclass(slots=True)
class CatState:
    detected: bool = False
    name: str | None = None
    hunger_current: int | None = None
    hunger_max: int | None = None
    rank: str | None = None
    level_current: int | None = None
    level_max: int | None = None
    points: int | None = None
    production_per_second: float | None = None
    capacity: int | None = None
    upgrade_cost: int | None = None
    raw_text: str = ""


@dataclass(slots=True)
class MeowState:
    detected: bool = False
    success: bool = False
    cooldown: bool = False
    points_gained: int | None = None
    balance: int | None = None
    retry_after_seconds: int | None = None
    raw_text: str = ""


@dataclass(slots=True)
class FactoryState:
    detected: bool = False
    warehouse_current: int | None = None
    warehouse_capacity: int | None = None
    warehouse_level: int | None = None
    workers_current: int | None = None
    workers_capacity: int | None = None
    workers_level: int | None = None
    machines_production_time: int | None = None
    machines_level: int | None = None
    factory_level: int | None = None
    factory_xp_current: int | None = None
    factory_xp_max: int | None = None
    raw_text: str = ""


@dataclass(slots=True)
class ProductionConfirmation:
    detected: bool = False
    product: str | None = None
    quantity: int | None = None
    percentage: int | None = None
    duration_seconds: int | None = None
    unit_cost: int | None = None
    total_cost: int | None = None
    market_price: int | None = None
    raw_text: str = ""


@dataclass(slots=True)
class ParsedButton:
    text: str
    normalized: str


@dataclass(slots=True)
class ButtonIndex:
    rows: list[list[ParsedButton]] = field(
        default_factory=list
    )

    @property
    def all_buttons(self) -> list[ParsedButton]:
        return [
            button
            for row in self.rows
            for button in row
        ]


def parse_cat_panel(
    text: str | None,
) -> CatState:
    raw = text or ""
    normalized = normalize_text(raw)

    state = CatState(
        raw_text=raw
    )

    if (
        "میو پوینت" not in normalized
        and "شکم" not in normalized
        and "پیشی" not in normalized
    ):
        return state

    state.detected = True

    name_match = re.search(
        r"نام\s*[:：]\s*([^\n\r]+)",
        normalized,
    )

    if name_match:
        state.name = name_match.group(1).strip()

    hunger_match = re.search(
        r"شکم.*?(\d[\d,]*)\s*/\s*(\d[\d,]*)",
        normalized,
    )

    if hunger_match:
        state.hunger_current = int(
            hunger_match.group(1).replace(",", "")
        )

        state.hunger_max = int(
            hunger_match.group(2).replace(",", "")
        )

    level_match = re.search(
        r"(?:سطح|لول)\s*[:：]?\s*(\d+)\s*/\s*([^\n\r]+)",
        normalized,
    )

    if level_match:
        state.level_current = int(
            level_match.group(1)
        )

        max_text = level_match.group(2)

        max_number = extract_first_number(
            max_text
        )

        if max_number is not None:
            state.level_max = max_number

    points_patterns = (
        r"میو\s*پوینت(?:\s*های)?\s*تولید(?:\s*شده)?\s*[:：]?\s*([0-9][0-9,\s]*)",
        r"میو\s*پوینت.*?تولید(?:\s*شده)?\s*[:：]?\s*([0-9][0-9,\s]*)",
    )

    for pattern in points_patterns:
        points_match = re.search(
            pattern,
            normalized,
        )

        if points_match:
            state.points = int(
                points_match.group(1)
                .replace(",", "")
                .replace(" ", "")
            )
            break

    production_match = re.search(
        r"تولید\s*میو\s*پوینت\s*در\s*ثانیه\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)",
        normalized,
    )

    if production_match:
        state.production_per_second = float(
            production_match.group(1)
        )

    capacity_match = re.search(
        r"ظرفیت\s*[:：]?\s*([0-9][0-9,\s]*)",
        normalized,
    )

    if capacity_match:
        state.capacity = int(
            capacity_match.group(1)
            .replace(",", "")
            .replace(" ", "")
        )

    cost_match = re.search(
        r"(?:هزینه|مبلغ|قیمت).*?([0-9][0-9,]*)",
        normalized,
    )

    if cost_match:
        state.upgrade_cost = int(
            cost_match.group(1)
            .replace(",", "")
        )

    return state


def parse_meow_response(
    text: str | None,
) -> MeowState:
    raw = text or ""
    normalized = normalize_text(raw)

    state = MeowState(
        raw_text=raw
    )

    if not normalized:
        return state

    positive = (
        "میو پوینت گرفتی",
        "میو میو گرفتی",
    )

    negative = (
        "هنوز میوت نمیاد",
        "باید صبر کنی",
    )

    if any(
        item in normalized
        for item in positive
    ):
        state.detected = True
        state.success = True

        numbers = extract_numbers(
            normalized
        )

        if numbers:
            state.points_gained = numbers[0]

        balance_match = re.search(
            r"میو\s*پوینت\s*هات\s*[:：]?\s*([0-9,\s]+)",
            normalized,
        )

        if balance_match:
            state.balance = int(
                balance_match.group(1)
                .replace(",", "")
                .replace(" ", "")
            )

        state.retry_after_seconds = (
            find_time_after_keywords(
                normalized,
                (
                    "بعد از",
                    "دوباره",
                ),
            )
        )

        return state

    if any(
        item in normalized
        for item in negative
    ):
        state.detected = True
        state.cooldown = True

        state.retry_after_seconds = (
            find_time_after_keywords(
                normalized,
                (
                    "باید",
                    "صبر",
                ),
            )
        )

        return state

    return state


def parse_factory_main(
    text: str | None,
) -> FactoryState:
    raw = text or ""
    normalized = normalize_text(raw)

    state = FactoryState(
        raw_text=raw
    )

    if (
        "کارخونه میویی" not in normalized
        and "کارخانه میویی" not in normalized
    ):
        return state

    state.detected = True

    warehouse_match = re.search(
        r"ظرفیت\s*انبار\s*[:：]?\s*(\d[\d,]*)\s*/\s*(\d[\d,]*)",
        normalized,
    )

    if warehouse_match:
        state.warehouse_current = int(
            warehouse_match.group(1)
            .replace(",", "")
        )

        state.warehouse_capacity = int(
            warehouse_match.group(2)
            .replace(",", "")
        )

    warehouse_level = re.search(
        r"انبار\s*کارخانه.*?سطح\s*[:：]?\s*(\d+)",
        normalized,
        re.S,
    )

    if warehouse_level:
        state.warehouse_level = int(
            warehouse_level.group(1)
        )

    workers_match = re.search(
        r"تعداد\s*کارگران.*?(\d+)\s*/\s*(\d+)",
        normalized,
    )

    if workers_match:
        state.workers_current = int(
            workers_match.group(1)
        )

        state.workers_capacity = int(
            workers_match.group(2)
        )

    worker_level = re.search(
        r"کارگران\s*کارخانه.*?سطح\s*[:：]?\s*(\d+)",
        normalized,
        re.S,
    )

    if worker_level:
        state.workers_level = int(
            worker_level.group(1)
        )

    production_time = re.search(
        r"زمان\s*تولید\s*محصول\s*[:：]?\s*([0-9]+)",
        normalized,
    )

    if production_time:
        state.machines_production_time = int(
            production_time.group(1)
        )

    machine_level = re.search(
        r"دستگاه(?:\s+های)?\s*تولید.*?سطح\s*[:：]?\s*(\d+)",
        normalized,
        re.S,
    )

    if machine_level:
        state.machines_level = int(
            machine_level.group(1)
        )

    factory_level = re.search(
        r"سطح\s*کارخونه\s*[:：]?\s*(\d+)",
        normalized,
    )

    if factory_level:
        state.factory_level = int(
            factory_level.group(1)
        )

    xp_match = re.search(
        r"([0-9,]+)\s*xp\s*/\s*([0-9,]+)\s*xp",
        normalized,
        re.I,
    )

    if xp_match:
        state.factory_xp_current = int(
            xp_match.group(1)
            .replace(",", "")
        )

        state.factory_xp_max = int(
            xp_match.group(2)
            .replace(",", "")
        )

    return state


def parse_production_confirmation(
    text: str | None,
) -> ProductionConfirmation:
    raw = text or ""
    normalized = normalize_text(raw)

    state = ProductionConfirmation(
        raw_text=raw
    )

    if (
        "آیا از تولید" not in normalized
        and "هزینه تولید" not in normalized
    ):
        return state

    state.detected = True

    quantity_match = re.search(
        r"تعداد\s*کل\s*تولید\s*[:：]?\s*([0-9,]+)",
        normalized,
    )

    if quantity_match:
        state.quantity = int(
            quantity_match.group(1)
            .replace(",", "")
        )

    percent_match = re.search(
        r"([0-9]{1,3})\s*%\s*محصول",
        normalized,
    )

    if percent_match:
        state.percentage = int(
            percent_match.group(1)
        )

    state.duration_seconds = (
        find_time_after_keywords(
            normalized,
            ("زمان مورد نیاز",),
        )
    )

    unit_cost_match = re.search(
        r"هر\s*یک\s*عدد\s*[:：]?\s*([0-9,]+)",
        normalized,
    )

    if unit_cost_match:
        state.unit_cost = int(
            unit_cost_match.group(1)
            .replace(",", "")
        )

    total_cost_match = re.search(
        r"هزینه\s*کل\s*[:：]?\s*([0-9,]+)",
        normalized,
    )

    if total_cost_match:
        state.total_cost = int(
            total_cost_match.group(1)
            .replace(",", "")
        )

    market_match = re.search(
        r"قیمت\s*فعلی\s*بازار\s*[:：]?\s*([0-9,]+)",
        normalized,
    )

    if market_match:
        state.market_price = int(
            market_match.group(1)
            .replace(",", "")
        )

    return state


def button_is(
    text: str | None,
    *keywords: str,
) -> bool:
    normalized = normalize_text(text)

    return all(
        normalize_text(keyword) in normalized
        for keyword in keywords
    )


def button_contains_any(
    text: str | None,
    *keywords: str,
) -> bool:
    normalized = normalize_text(text)

    return any(
        normalize_text(keyword) in normalized
        for keyword in keywords
    )


def is_percentage_button(
    text: str | None,
) -> int | None:
    normalized = normalize_text(text)

    match = re.fullmatch(
        r"(25|50|75|100)\s*%",
        normalized,
    )

    if not match:
        return None

    return int(
        match.group(1)
    )


def is_production_product(
    text: str | None,
) -> bool:
    normalized = normalize_text(text)

    return (
        "تولیدی" in normalized
        or (
            "تولید" in normalized
            and any(
                keyword in normalized
                for keyword in (
                    "آبنبات",
                    "کیک",
                    "تکنولوژی",
                    "خودرو",
                    "هواپیما",
                )
            )
        )
    )


def product_key(
    text: str | None,
) -> str:
    return compact_text(text)


def find_first_matching_button(
    message,
    predicate,
):
    if not message or not message.buttons:
        return None

    for row in message.buttons:
        for button in row:
            text = getattr(
                button,
                "text",
                None,
            )

            if predicate(text):
                return button

    return None

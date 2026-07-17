"""Pure proposal totals math. No DB, no I/O — unit-tested in isolation.

Money is integer EUR cents; ``tax_rate`` is a percentage. Lines are grouped by
``billing_type``; each group gets its own net/tax/gross. A proposal-level
discount (basis points) reduces each line's net proportionally BEFORE tax.
``Totals.value`` is the one-time net total (excl. IVA) — the number persisted to
``proposals.value`` so the lifecycle (BR-025..028) and dashboard stay intact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal


@dataclass(frozen=True)
class LineInput:
    quantity: Decimal
    unit_price: int  # EUR cents
    tax_rate: Decimal  # percent
    billing_type: str  # one_time | monthly | annual


@dataclass(frozen=True)
class GroupTotal:
    net: int = 0
    tax: int = 0
    gross: int = 0


@dataclass(frozen=True)
class Totals:
    one_time: GroupTotal = field(default_factory=GroupTotal)
    monthly: GroupTotal = field(default_factory=GroupTotal)
    annual: GroupTotal = field(default_factory=GroupTotal)
    value: int = 0


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def compute_totals(lines: list[LineInput], *, discount_bps: int = 0) -> Totals:
    factor = (Decimal(10000) - Decimal(discount_bps)) / Decimal(10000)
    buckets: dict[str, list[int]] = {
        "one_time": [0, 0],
        "monthly": [0, 0],
        "annual": [0, 0],
    }
    for line in lines:
        raw_net = Decimal(line.quantity) * Decimal(line.unit_price)
        net = _round(raw_net * factor)
        tax = _round(Decimal(net) * Decimal(line.tax_rate) / Decimal(100))
        bucket = buckets.get(line.billing_type)
        if bucket is None:
            continue
        bucket[0] += net
        bucket[1] += tax

    def group(key: str) -> GroupTotal:
        net, tax = buckets[key]
        return GroupTotal(net=net, tax=tax, gross=net + tax)

    one_time = group("one_time")
    monthly = group("monthly")
    annual = group("annual")
    return Totals(
        one_time=one_time, monthly=monthly, annual=annual, value=one_time.net
    )

"""Pure unit tests for proposal totals math (no DB)."""

from __future__ import annotations

from decimal import Decimal

from app.services.proposal_totals import LineInput, compute_totals


def L(qty, price, tax, billing):
    return LineInput(
        quantity=Decimal(str(qty)),
        unit_price=price,
        tax_rate=Decimal(str(tax)),
        billing_type=billing,
    )


def test_single_one_time_line_no_discount():
    t = compute_totals([L(2, 10000, 23, "one_time")])
    assert t.one_time.net == 20000
    assert t.one_time.tax == 4600
    assert t.one_time.gross == 24600
    assert t.value == 20000  # persisted proposals.value = one-time net


def test_mixed_billing_groups_are_separate():
    t = compute_totals([
        L(1, 500000, 23, "one_time"),
        L(1, 20000, 23, "monthly"),
        L(1, 120000, 6, "annual"),
    ])
    assert t.one_time.net == 500000
    assert t.monthly.net == 20000
    assert t.annual.net == 120000
    assert t.value == 500000


def test_discount_applies_to_net_before_tax_proportionally():
    t = compute_totals([L(1, 100000, 23, "one_time")], discount_bps=1000)
    assert t.one_time.net == 90000
    assert t.one_time.tax == 20700  # 23% of 90000
    assert t.value == 90000


def test_rounding_is_per_line_half_up():
    # 3 units @ 333c = net 999; tax round(999*0.23)=round(229.77)=230
    t = compute_totals([L(3, 333, 23, "one_time")])
    assert t.one_time.net == 999
    assert t.one_time.tax == 230


def test_empty_lines_zero_totals():
    t = compute_totals([])
    assert t.value == 0
    assert t.one_time.gross == 0 and t.monthly.gross == 0 and t.annual.gross == 0

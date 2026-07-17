"""Pure unit tests for the proposal placeholder resolver (no DB)."""

from __future__ import annotations

from app.services.proposal_placeholders import resolve


def test_resolves_known_keys():
    out = resolve(
        "Olá {{cliente}} da {{empresa}}",
        {"cliente": "Ana", "empresa": "ACME"},
    )
    assert out == "Olá Ana da ACME"


def test_missing_value_left_verbatim():
    out = resolve("Para {{empresa}}", {"empresa": None})
    assert out == "Para {{empresa}}"


def test_unknown_placeholder_left_verbatim():
    out = resolve("{{desconhecido}}", {"cliente": "Ana"})
    assert out == "{{desconhecido}}"


def test_none_text_is_empty_string():
    assert resolve("", {}) == ""

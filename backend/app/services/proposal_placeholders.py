"""Pure placeholder resolution for proposal sections & terms.

``{{key}}`` tokens are replaced from the given context. Only known keys with a
non-empty value are substituted; everything else is left verbatim so a missing
company shows ``{{empresa}}`` rather than a blank or the string "None".
"""

from __future__ import annotations

import re

_ALLOWED = ("cliente", "empresa", "data", "validade", "referencia")
_TOKEN = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def resolve(text: str, context: dict[str, str | None]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in _ALLOWED and context.get(key):
            return str(context[key])
        return match.group(0)

    return _TOKEN.sub(replace, text or "")

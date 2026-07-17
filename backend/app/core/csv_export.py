"""CSV serialization with formula-injection hardening (F19, issue #59 parity).

The reports surface streams user-authored data (company/project/member names)
into spreadsheet cells. A cell beginning with ``= + - @`` — or a tab / carriage
return — is executed as a formula by Excel/Google Sheets (CWE-1236). We mirror
the frontend guard shipped in ``frontend/src/components/reports/csv.ts`` (#59):
prefix any such cell with a single quote so the spreadsheet treats it as literal
text. RFC-4180 delimiter / quote / newline escaping is applied on top.

The delimiter is ``;`` and the output carries a UTF-8 BOM, matching the frontend
exporter so a European-locale Excel opens the file with correct columns and
accented characters.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

DELIMITER = ";"
BOM = "﻿"

# A leading =, +, -, @, TAB or CR turns the cell into a formula target (OWASP).
_FORMULA_TRIGGERS = re.compile(r"^[=+\-@\t\r]")


def escape_cell(value: object) -> str:
    """Render one cell: neutralise formula triggers, then RFC-4180 quote."""
    text = "" if value is None else str(value)
    if _FORMULA_TRIGGERS.search(text):
        text = f"'{text}"
    if DELIMITER in text or '"' in text or "\n" in text or "\r" in text:
        text = '"' + text.replace('"', '""') + '"'
    return text


def render_row(cells: Sequence[object]) -> str:
    return DELIMITER.join(escape_cell(c) for c in cells)


def render_csv(header: Sequence[object], rows: Iterable[Sequence[object]]) -> str:
    """Assemble a full CSV document (BOM + header + rows, CRLF line endings)."""
    lines = [render_row(header)]
    lines.extend(render_row(row) for row in rows)
    return BOM + "\r\n".join(lines) + "\r\n"

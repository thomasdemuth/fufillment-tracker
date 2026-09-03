"""Read xlsx/xls/ods/csv/tsv files into rows of strings, with header-row detection."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from python_calamine import CalamineWorkbook

SPREADSHEET_EXTS = {".xlsx", ".xlsm", ".xls", ".xlsb", ".ods"}
TEXT_EXTS = {".csv", ".tsv", ".txt"}


@dataclass
class Sheet:
    name: str
    rows: list[list[str]] = field(default_factory=list)


@dataclass
class Workbook:
    sheets: list[Sheet]

    def sheet(self, name: str | None) -> Sheet:
        if name:
            for s in self.sheets:
                if s.name == name:
                    return s
        return self.sheets[0]


def _cell_to_str(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return repr(v)
    if isinstance(v, datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, date):
        return v.isoformat()
    return str(v).strip()


def _read_text(data: bytes) -> list[list[str]]:
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    return [[c.strip() for c in row] for row in reader]


def read_workbook(path: Path | str, data: bytes | None = None) -> Workbook:
    path = Path(path)
    ext = path.suffix.lower()
    if data is None:
        data = path.read_bytes()
    if ext in TEXT_EXTS or ext not in SPREADSHEET_EXTS:
        return Workbook(sheets=[Sheet(name=path.stem, rows=_read_text(data))])
    wb = CalamineWorkbook.from_filelike(io.BytesIO(data))
    sheets: list[Sheet] = []
    for name in wb.sheet_names:
        rows = wb.get_sheet_by_name(name).to_python(skip_empty_area=False)
        str_rows = [[_cell_to_str(c) for c in row] for row in rows]
        # drop fully-empty trailing rows
        while str_rows and not any(str_rows[-1]):
            str_rows.pop()
        sheets.append(Sheet(name=name, rows=str_rows))
    if not sheets:
        sheets.append(Sheet(name="Sheet1", rows=[]))
    return Workbook(sheets=sheets)


HEADER_HINTS = (
    "name",
    "address",
    "city",
    "state",
    "zip",
    "postal",
    "tracking",
    "carrier",
    "email",
    "phone",
    "order",
    "ship",
    "company",
    "street",
    "recipient",
    "customer",
)


def detect_header_row(rows: list[list[str]], max_scan: int = 15) -> int:
    """Return the index of the most header-like row within the first `max_scan` rows."""
    best_idx, best_score = 0, -1.0
    for i, row in enumerate(rows[:max_scan]):
        cells = [c for c in row if c]
        if len(cells) < 2:
            continue
        lower = [c.lower() for c in cells]
        hint_hits = sum(any(h in c for h in HEADER_HINTS) for c in lower)
        non_numeric = sum(not c.replace(".", "", 1).replace("-", "", 1).isdigit() for c in cells)
        unique = len(set(lower)) == len(lower)
        score = hint_hits * 3 + (non_numeric / len(cells)) * 2 + (1 if unique else 0) + len(cells) * 0.05
        if score > best_score:
            best_idx, best_score = i, score
    return best_idx


def table_from_rows(rows: list[list[str]], header_row: int) -> tuple[list[str], list[list[str]]]:
    if not rows:
        return [], []
    header = rows[header_row] if header_row < len(rows) else []
    width = max([len(header)] + [len(r) for r in rows[header_row + 1 :]] or [0])
    headers = [(h or f"Column {i + 1}").strip() for i, h in enumerate(header + [""] * (width - len(header)))]
    # de-duplicate header names
    seen: dict[str, int] = {}
    for i, h in enumerate(headers):
        if h in seen:
            seen[h] += 1
            headers[i] = f"{h} ({seen[h]})"
        else:
            seen[h] = 1
    body = []
    for r in rows[header_row + 1 :]:
        r = list(r) + [""] * (width - len(r))
        if any(c for c in r):
            body.append(r[:width])
    return headers, body

from pathlib import Path

from app.services.spreadsheet import detect_header_row, read_workbook, table_from_rows


def test_reads_xlsx(demo_dir: Path):
    wb = read_workbook(demo_dir / "batch_1.xlsx")
    sh = wb.sheets[0]
    assert detect_header_row(sh.rows) == 0
    headers, body = table_from_rows(sh.rows, 0)
    assert "Tracking Number" in headers
    assert len(body) == 140


def test_reads_messy_csv_with_title_row(demo_dir: Path):
    wb = read_workbook(demo_dir / "batch_3_messy.csv")
    sh = wb.sheets[0]
    assert detect_header_row(sh.rows) == 1
    headers, body = table_from_rows(sh.rows, 1)
    assert headers == ["Recipient", "Address", "City, State Zip", "Tracking ID", "Sent On"]
    assert len(body) == 70


def test_csv_with_bom_and_semicolons(tmp_path: Path):
    p = tmp_path / "x.csv"
    p.write_bytes("﻿Name;Tracking\nA;9400111111111111111111\n".encode())
    wb = read_workbook(p)
    headers, body = table_from_rows(wb.sheets[0].rows, 0)
    assert headers == ["Name", "Tracking"]
    assert body == [["A", "9400111111111111111111"]]


def test_duplicate_headers_are_disambiguated():
    headers, _ = table_from_rows([["Name", "Name", ""], ["a", "b", "c"]], 0)
    assert headers == ["Name", "Name (2)", "Column 3"]

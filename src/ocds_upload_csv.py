"""Convert OCDS JSONL procurement data into upload-ready CSV rows."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

UPLOAD_COLUMNS = [
    "ocid",
    "tender_id",
    "tender_title",
    "tender_description",
    "buyer_id",
    "buyer_name",
    "supplier_id",
    "supplier_name",
    "tender_value_amount",
    "award_value_amount",
    "currency",
    "tender_datePublished",
    "award_date",
    "tender_procurementMethod",
    "tender_mainProcurementCategory",
    "tender_status",
]


@dataclass(frozen=True)
class ConversionStats:
    """Summary of a conversion run."""

    records_read: int
    rows_written: int
    rows_skipped: int


def _read_jsonl(source: Path) -> Iterable[dict[str, Any]]:
    opener = gzip.open if source.suffix == ".gz" else open
    with opener(source, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def _first(values: Any) -> dict[str, Any]:
    if isinstance(values, list) and values:
        first = values[0]
        if isinstance(first, dict):
            return first
    return {}


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _format_number(value: Any) -> str:
    if value in (None, ""):
        return ""
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return ""
    formatted = format(number, "f")
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    return formatted


def _normalize_date(value: Any) -> str:
    text = _safe_text(value)
    if not text:
        return ""
    if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-":
        return text[:10]
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return parsed.date().isoformat()


def _slug_fallback(value: str, prefix: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return f"{prefix}{cleaned or 'unknown'}"


def _normalize_row(record: dict[str, Any], default_procurement_method: str) -> dict[str, str] | None:
    tender = record.get("tender") or {}
    buyer = record.get("buyer") or {}
    awards = record.get("awards") or []
    if not awards:
        return None

    award = _first(awards)
    suppliers = award.get("suppliers") or []
    supplier = _first(suppliers)
    if not supplier.get("name"):
        return None

    items = tender.get("items") or award.get("items") or []
    item = _first(items)
    classification = item.get("classification") or {}
    tender_title = _safe_text(tender.get("title") or award.get("title") or record.get("title"))
    tender_description = _safe_text(
        tender.get("description")
        or classification.get("description")
        or item.get("description")
        or tender_title
    )
    buyer_name = _safe_text(
        buyer.get("name")
        or _safe_text(tender.get("procuringEntity", {}).get("name"))
    )
    buyer_id = _safe_text(buyer.get("id") or tender.get("procuringEntity", {}).get("id"))
    supplier_name = _safe_text(supplier.get("name"))
    supplier_id = _safe_text(supplier.get("id")) or _slug_fallback(supplier_name, "supplier-")

    tender_value = tender.get("value") or {}
    min_value = tender.get("minValue") or {}
    award_value = award.get("value") or {}

    tender_value_amount = _format_number(
        tender_value.get("amount")
        if tender_value.get("amount") not in (None, "")
        else min_value.get("amount")
    )
    if not tender_value_amount:
        tender_value_amount = _format_number(award_value.get("amount"))

    award_value_amount = _format_number(award_value.get("amount"))
    if not award_value_amount:
        award_value_amount = tender_value_amount

    currency = _safe_text(
        award_value.get("currency")
        or tender_value.get("currency")
        or min_value.get("currency")
        or "IDR"
    )
    tender_date = _normalize_date(tender.get("datePublished") or record.get("date") or award.get("date"))
    award_date = _normalize_date(award.get("date") or tender.get("datePublished") or record.get("date"))

    if not tender_title or not tender_description or not buyer_name or not supplier_name:
        return None
    if not tender_value_amount or not award_value_amount or not tender_date or not award_date:
        return None

    row = {
        "ocid": _safe_text(record.get("ocid")) or _slug_fallback(tender_title, "ocid-"),
        "tender_id": _safe_text(tender.get("id")) or _safe_text(record.get("ocid")),
        "tender_title": tender_title,
        "tender_description": tender_description,
        "buyer_id": buyer_id or _slug_fallback(buyer_name, "buyer-"),
        "buyer_name": buyer_name,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "tender_value_amount": tender_value_amount,
        "award_value_amount": award_value_amount,
        "currency": currency,
        "tender_datePublished": tender_date,
        "award_date": award_date,
        "tender_procurementMethod": _safe_text(tender.get("procurementMethod") or default_procurement_method),
        "tender_mainProcurementCategory": _safe_text(tender.get("mainProcurementCategory")),
        "tender_status": _safe_text(tender.get("status")),
    }
    return row


def convert_ocds_jsonl_to_upload_rows(
    source: Path,
    *,
    limit: int | None = None,
    default_procurement_method: str = "open",
) -> tuple[list[dict[str, str]], ConversionStats]:
    rows: list[dict[str, str]] = []
    records_read = 0
    rows_skipped = 0

    for record in _read_jsonl(source):
        records_read += 1
        row = _normalize_row(record, default_procurement_method)
        if row is None:
            rows_skipped += 1
            continue
        rows.append(row)
        if limit is not None and len(rows) >= limit:
            break

    return rows, ConversionStats(
        records_read=records_read,
        rows_written=len(rows),
        rows_skipped=rows_skipped,
    )


def convert_ocds_jsonl_to_upload_csv(
    source: Path,
    output: Path,
    *,
    limit: int | None = None,
    default_procurement_method: str = "open",
) -> ConversionStats:
    rows, stats = convert_ocds_jsonl_to_upload_rows(
        source,
        limit=limit,
        default_procurement_method=default_procurement_method,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=UPLOAD_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert OCDS JSONL procurement data into upload-ready CSV rows."
    )
    parser.add_argument("--input", type=Path, required=True, help="Path to OCDS .jsonl or .jsonl.gz file.")
    parser.add_argument("--output", type=Path, required=True, help="Path to the output CSV file.")
    parser.add_argument("--limit", type=int, default=None, help="Optional maximum number of upload rows to write.")
    parser.add_argument(
        "--default-procurement-method",
        default="open",
        help="Fallback procurement method when the source record is blank.",
    )
    args = parser.parse_args(argv)

    stats = convert_ocds_jsonl_to_upload_csv(
        args.input,
        args.output,
        limit=args.limit,
        default_procurement_method=args.default_procurement_method,
    )
    print(json.dumps(asdict(stats), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

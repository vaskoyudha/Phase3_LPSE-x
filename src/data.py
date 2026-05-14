"""Data download, flattening, loading, and profiling utilities."""

from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

# OCP Data Registry bulk download base URL
_OCP_BASE = (
    "https://data.open-contracting.org/en/publication/101/download?name={name}"
)

# Years with substantial data (>10 MB each)
AVAILABLE_YEARS = list(range(2014, 2024))  # 2014-2023

# The canonical combined raw file
RAW_JSONL_GZ = RAW_DIR / "ocds_indonesia.jsonl.gz"

# The canonical flattened file
FLAT_PARQUET = PROCESSED_DIR / "ocds_flat.parquet"

# Fields we need for downstream feature engineering and labeling
REQUIRED_FIELDS = [
    "ocid",
    "tender_id",
    "tender_datePublished",
    "tender_title",
    "tender_description",
    "tender_status",
    "tender_procurementMethod",
    "tender_value_amount",
    "tender_value_currency",
    "tender_mainProcurementCategory",
    "tender_items_count",
    "tender_tenderPeriod_startDate",
    "tender_tenderPeriod_endDate",
    "tender_numberOfTenderers",
    "buyer_id",
    "buyer_name",
    "award_id",
    "award_status",
    "award_date",
    "award_value_amount",
    "award_value_currency",
    "award_items_count",
    "supplier_id",
    "supplier_name",
    "contract_id",
    "contract_value_amount",
    "contract_dateSigned",
]

# Max plausible year for date filtering
MAX_VALID_YEAR = 2026


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def download_year(year: int, dest_dir: Path | None = None) -> Path:
    """Download a single year of OCDS data from OCP Data Registry.

    Returns the path to the downloaded .jsonl.gz file.
    """
    dest_dir = dest_dir or RAW_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{year}.jsonl.gz"
    url = _OCP_BASE.format(name=filename)
    dest = dest_dir / filename

    if dest.exists():
        if _gzip_looks_readable(dest):
            logger.info("Already downloaded: %s", dest)
            return dest
        logger.warning("Existing download is corrupted, re-downloading: %s", dest)
        dest.unlink()

    logger.info("Downloading %s → %s", url, dest)
    urlretrieve(url, dest)
    logger.info("Downloaded %s (%.1f MB)", dest.name, dest.stat().st_size / 1e6)
    return dest


def _gzip_looks_readable(path: Path) -> bool:
    """Quick integrity check for a gzip file.

    We only read enough to ensure the file header and at least the first record
    are accessible, which is sufficient to detect interrupted downloads.
    """
    try:
        with gzip.open(path, "rb") as fh:
            for _ in iter(lambda: fh.read(1024 * 1024), b""):
                pass
        return True
    except (OSError, EOFError):
        return False


def download_all(
    years: list[int] | None = None, dest_dir: Path | None = None
) -> list[Path]:
    """Download multiple years of OCDS data.

    Returns list of downloaded file paths.
    """
    years = years or AVAILABLE_YEARS
    return [download_year(y, dest_dir) for y in years]


# ---------------------------------------------------------------------------
# OCDS JSONL Parsing and Flattening
# ---------------------------------------------------------------------------


def _safe_get(d: dict, *keys: str, default: Any = None) -> Any:
    """Safely traverse nested dictionary keys."""
    current = d
    for k in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(k, default)
    return current


def _extract_first(lst: list[dict] | None, *keys: str, default: Any = None) -> Any:
    """Get a nested value from the first element of a list."""
    if not lst:
        return default
    return _safe_get(lst[0], *keys, default=default)


def _extract_award_supplier_rows(record: dict) -> list[dict]:
    """Extract all award-supplier relationships from an OCDS record.

    The flat training table still keeps one supplier per award row for backward
    compatibility, but this helper preserves the full supplier list so future
    graph/entity workflows can use it.
    """
    ocid = record.get("ocid", "")
    tender_id = _safe_get(record, "tender", "id", default="")
    buyer_id = _safe_get(record, "buyer", "id", default="")
    buyer_name = _safe_get(record, "buyer", "name", default="")

    rows: list[dict] = []
    for award in record.get("awards", []) or []:
        award_id = award.get("id", "")
        award_date = award.get("date", "")
        award_status = award.get("status", "")
        for supplier_position, supplier in enumerate(award.get("suppliers", []) or []):
            rows.append(
                {
                    "ocid": ocid,
                    "tender_id": tender_id,
                    "award_id": award_id,
                    "award_date": award_date,
                    "award_status": award_status,
                    "buyer_id": buyer_id,
                    "buyer_name": buyer_name,
                    "supplier_id": supplier.get("id", ""),
                    "supplier_name": supplier.get("name", ""),
                    "supplier_position": supplier_position,
                }
            )
    return rows


def _extract_party_rows(record: dict) -> list[dict]:
    """Extract normalized party/entity rows from an OCDS record."""
    ocid = record.get("ocid", "")
    rows: list[dict] = []
    for party in record.get("parties", []) or []:
        roles = party.get("roles", []) or []
        rows.append(
            {
                "ocid": ocid,
                "party_id": party.get("id", ""),
                "party_name": party.get("name", ""),
                "party_roles": "|".join(str(role) for role in roles),
            }
        )
    return rows


def extract_relational_tables(paths: list[Path] | Path) -> dict[str, pd.DataFrame]:
    """Extract graph/entity-ready relational tables from OCDS JSONL files."""
    if isinstance(paths, Path):
        paths = [paths]

    award_supplier_rows: list[dict] = []
    party_rows: list[dict] = []

    for path in paths:
        logger.info("Extracting relational tables from %s ...", path.name)
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                award_supplier_rows.extend(_extract_award_supplier_rows(record))
                party_rows.extend(_extract_party_rows(record))

    return {
        "award_suppliers": pd.DataFrame(award_supplier_rows),
        "parties": pd.DataFrame(party_rows),
    }


def save_relational_tables(
    tables: dict[str, pd.DataFrame],
    output_dir: Path | None = None,
) -> dict[str, Path]:
    """Persist extracted relational tables as parquet artifacts."""
    output_dir = output_dir or (PROCESSED_DIR / "relational")
    output_dir.mkdir(parents=True, exist_ok=True)

    saved: dict[str, Path] = {}
    for name, df in tables.items():
        path = output_dir / f"{name}.parquet"
        df.to_parquet(path, index=False, engine="pyarrow")
        saved[name] = path
    return saved


def _flatten_release(record: dict) -> list[dict]:
    """Flatten one OCDS record (contracting process) into row(s).

    Strategy: one row per award. If no awards, one row for the tender.
    This keeps the grain at tender-or-award level, which is what we need
    for risk detection.
    """
    ocid = record.get("ocid", "")
    tender = record.get("tender", {}) or {}
    buyer = record.get("buyer", {}) or {}
    parties = record.get("parties", []) or []
    awards = record.get("awards", []) or []
    contracts = record.get("contracts", []) or []
    tender_value = tender.get("value", {}) or {}
    tender_min_value = tender.get("minValue", {}) or {}
    tender_title = tender.get("title", "")
    tender_description = tender.get("description") or tender_title
    buyer_name = buyer.get("name", "") or _safe_get(tender, "procuringEntity", "name", default="")

    # Build a lookup for contracts by awardID
    contract_by_award = {}
    for c in contracts:
        aid = c.get("awardID", "")
        if aid:
            contract_by_award[aid] = c

    # Base fields from tender
    base = {
        "ocid": ocid,
        "tender_id": tender.get("id", ""),
        "tender_title": tender_title,
        "tender_description": tender_description,
        "tender_status": tender.get("status", ""),
        "tender_statusDetail": _safe_get(tender, "statusDetails", default=""),
        "tender_procurementMethod": tender.get("procurementMethod", ""),
        "tender_procurementMethodDetails": tender.get(
            "procurementMethodDetails", ""
        ),
        "tender_value_amount": tender_value.get("amount", tender_min_value.get("amount")),
        "tender_value_currency": tender_value.get("currency", tender_min_value.get("currency", "IDR")),
        "tender_mainProcurementCategory": tender.get(
            "mainProcurementCategory", ""
        ),
        "tender_items_count": len(tender.get("items", []) or []),
        "tender_tenderPeriod_startDate": _safe_get(
            tender, "tenderPeriod", "startDate"
        ),
        "tender_tenderPeriod_endDate": _safe_get(
            tender, "tenderPeriod", "endDate"
        ),
        "tender_numberOfTenderers": tender.get("numberOfTenderers"),
        "tender_datePublished": _safe_get(
            tender, "datePublished",
            default=record.get("date", ""),
        ),
        "buyer_id": buyer.get("id", ""),
        "buyer_name": buyer_name,
    }

    # If no awards, emit a single row
    if not awards:
        base.update(
            {
                "award_id": None,
                "award_status": None,
                "award_date": None,
                "award_value_amount": None,
                "award_value_currency": None,
                "award_items_count": None,
                "supplier_id": None,
                "supplier_name": None,
                "contract_id": None,
                "contract_value_amount": None,
                "contract_dateSigned": None,
            }
        )
        return [base]

    rows = []
    for award in awards:
        row = base.copy()
        award_id = award.get("id", "")

        # First supplier from this award
        suppliers = award.get("suppliers", []) or []
        first_supplier = suppliers[0] if suppliers else {}

        # Linked contract
        contract = contract_by_award.get(award_id, {})

        row.update(
            {
                "award_id": award_id,
                "award_status": award.get("status", ""),
                "award_date": award.get("date", ""),
                "award_value_amount": _safe_get(award, "value", "amount"),
                "award_value_currency": _safe_get(
                    award, "value", "currency", default="IDR"
                ),
                "award_items_count": len(award.get("items", []) or []),
                "supplier_id": first_supplier.get("id", ""),
                "supplier_name": first_supplier.get("name", ""),
                "contract_id": contract.get("id", ""),
                "contract_value_amount": _safe_get(
                    contract, "value", "amount"
                ),
                "contract_dateSigned": contract.get("dateSigned", ""),
            }
        )
        rows.append(row)

    return rows


def flatten_jsonl_gz(paths: list[Path] | Path) -> pd.DataFrame:
    """Read one or more .jsonl.gz files and flatten to a DataFrame.

    Each line in the JSONL is one OCDS record (contracting process).
    """
    if isinstance(paths, Path):
        paths = [paths]

    all_rows: list[dict] = []
    error_count = 0

    for path in paths:
        logger.info("Flattening %s ...", path.name)
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    all_rows.extend(_flatten_release(record))
                except json.JSONDecodeError:
                    error_count += 1
                    if error_count <= 10:
                        logger.warning(
                            "JSON parse error in %s line %d", path.name, line_num
                        )

    logger.info(
        "Flattened %d rows from %d files (%d parse errors)",
        len(all_rows),
        len(paths),
        error_count,
    )

    df = pd.DataFrame(all_rows)
    return df


# ---------------------------------------------------------------------------
# Date Cleaning
# ---------------------------------------------------------------------------

_DATE_COLS = [
    "tender_tenderPeriod_startDate",
    "tender_tenderPeriod_endDate",
    "tender_datePublished",
    "award_date",
    "contract_dateSigned",
]


def clean_dates(df: pd.DataFrame) -> pd.DataFrame:
    """Parse date columns and filter impossible dates.

    Known issue from OCP: dates up to year 3020 exist as typos.
    We keep only dates in [2008, MAX_VALID_YEAR].
    """
    df = df.copy()

    for col in _DATE_COLS:
        if col not in df.columns:
            continue
        df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)
        # Quarantine impossible dates
        mask_bad = df[col].notna() & (
            (df[col].dt.year < 2008) | (df[col].dt.year > MAX_VALID_YEAR)
        )
        n_bad = mask_bad.sum()
        if n_bad > 0:
            logger.info("Quarantined %d impossible dates in %s", n_bad, col)
            df.loc[mask_bad, col] = pd.NaT

    return df


# ---------------------------------------------------------------------------
# Quality Report
# ---------------------------------------------------------------------------


def generate_quality_report(df: pd.DataFrame, output: Path | None = None) -> str:
    """Generate a markdown quality report for the flattened dataset.

    Documents row count, date range, field coverage, NaN rates,
    and a recommendation on bid-derived features.
    """
    output = output or (PROCESSED_DIR / "quality_report.md")
    output.parent.mkdir(parents=True, exist_ok=True)

    lines = ["# Data Quality Report\n"]
    lines.append(f"## Overview\n")
    lines.append(f"- **Total rows**: {len(df):,}")
    lines.append(f"- **Total columns**: {len(df.columns)}")
    lines.append(f"- **Unique OCIDs**: {df['ocid'].nunique():,}")

    # Date range
    if "tender_datePublished" in df.columns:
        valid_dates = df["tender_datePublished"].dropna()
        if len(valid_dates) > 0:
            lines.append(
                f"- **Date range**: {valid_dates.min()} → {valid_dates.max()}"
            )

    lines.append("")

    # Field coverage table
    lines.append("## Field Coverage\n")
    lines.append("| Field | Non-null Count | Coverage % | Unique |")
    lines.append("|-------|---------------|-----------|--------|")

    for col in REQUIRED_FIELDS:
        if col not in df.columns:
            lines.append(f"| `{col}` | MISSING | 0.0% | — |")
            continue
        non_null = df[col].notna().sum()
        coverage = non_null / len(df) * 100 if len(df) > 0 else 0
        try:
            unique = df[col].nunique()
        except TypeError:
            unique = "—"
        lines.append(
            f"| `{col}` | {non_null:,} | {coverage:.1f}% | {unique} |"
        )

    lines.append("")

    # Major NaN risks
    lines.append("## Major NaN Risks\n")
    high_nan = []
    for col in REQUIRED_FIELDS:
        if col not in df.columns:
            high_nan.append((col, 100.0))
            continue
        nan_pct = (1 - df[col].notna().mean()) * 100
        if nan_pct > 30:
            high_nan.append((col, nan_pct))

    if high_nan:
        for col, pct in sorted(high_nan, key=lambda x: -x[1]):
            lines.append(f"- `{col}`: {pct:.1f}% missing")
    else:
        lines.append("No fields with >30% missing data.")

    lines.append("")

    # Bid-level coverage assessment
    lines.append("## Bid-Derived Features Decision\n")
    tenderers_coverage = 0.0
    if "tender_numberOfTenderers" in df.columns:
        tenderers_coverage = df["tender_numberOfTenderers"].notna().mean() * 100

    if tenderers_coverage >= 50:
        lines.append(
            f"- **Decision**: bid-derived features **ON** "
            f"(numberOfTenderers coverage: {tenderers_coverage:.1f}%)"
        )
    else:
        lines.append(
            f"- **Decision**: bid-derived features **OFF** "
            f"(numberOfTenderers coverage: {tenderers_coverage:.1f}% < 50%)"
        )
        lines.append(
            "- Bid-derived features will be kept nullable and non-blocking per risk control."
        )

    report_text = "\n".join(lines)
    output.write_text(report_text, encoding="utf-8")
    logger.info("Quality report written to %s", output)
    return report_text


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run_pipeline(
    years: list[int] | None = None,
    skip_download: bool = False,
) -> pd.DataFrame:
    """Execute the full data acquisition and flattening pipeline.

    1. Download OCDS JSONL files
    2. Flatten to tabular format
    3. Clean dates
    4. Save as parquet
    5. Generate quality report

    Returns the flattened, cleaned DataFrame.
    """
    years = years or AVAILABLE_YEARS

    # Step 1: Download
    if not skip_download:
        paths = download_all(years)
    else:
        paths = [RAW_DIR / f"{y}.jsonl.gz" for y in years if (RAW_DIR / f"{y}.jsonl.gz").exists()]
        if not paths:
            raise FileNotFoundError("No downloaded files found and skip_download=True")

    # Step 2: Flatten
    df = flatten_jsonl_gz(paths)

    # Step 2b: Preserve richer relational views for graph/entity work
    relational_tables = extract_relational_tables(paths)
    save_relational_tables(relational_tables)

    # Step 3: Clean dates
    df = clean_dates(df)

    # Step 4: Save as canonical parquet
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(FLAT_PARQUET, index=False, engine="pyarrow")
    logger.info(
        "Saved %d rows to %s (%.1f MB)",
        len(df),
        FLAT_PARQUET,
        FLAT_PARQUET.stat().st_size / 1e6,
    )

    # Step 5: Quality report
    generate_quality_report(df)

    return df


def load_flat() -> pd.DataFrame:
    """Load the canonical flattened parquet file."""
    if not FLAT_PARQUET.exists():
        raise FileNotFoundError(
            f"{FLAT_PARQUET} not found. Run src.data.run_pipeline() first."
        )
    return pd.read_parquet(FLAT_PARQUET)

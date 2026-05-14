"""Temporal split and development-window utilities.

This module owns ALL split logic for the project. No other module
should implement train/test splitting.

Hard rules:
- Raw train/test split happens BEFORE feature engineering.
- test_data/ is NEVER used for HPO or calibration.
- All splits are temporal: max(train_date) < min(test_date).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd

from src.artifacts import PROJECT_ROOT

# Processed directory for metadata files
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

TRAIN_DIR = PROJECT_ROOT / "train_data"
TEST_DIR = PROJECT_ROOT / "test_data"
SPLIT_METADATA = PROCESSED_DIR / "split_metadata.json"
DEV_SPLIT_MANIFEST = PROCESSED_DIR / "dev_split_manifest.json"


# ---------------------------------------------------------------------------
# External raw split (Task 5)
# ---------------------------------------------------------------------------


def external_raw_split(
    df: pd.DataFrame,
    date_col: str = "tender_datePublished",
    split_date: str | None = None,
    test_ratio: float = 0.2,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split raw data temporally into train and test sets.

    The split guarantees: max(train[date_col]) < min(test[date_col]).

    Parameters
    ----------
    df : pd.DataFrame
        The full flattened dataset with parsed datetime columns.
    date_col : str
        Column to use for temporal ordering.
    split_date : str or None
        Explicit cutoff date (ISO format). If None, computed from test_ratio.
    test_ratio : float
        Approximate fraction of data for the test set (used only if
        split_date is None).

    Returns
    -------
    train_df, test_df : tuple of DataFrames
    """
    # Ensure date column exists and is datetime
    if date_col not in df.columns:
        raise ValueError(f"Date column '{date_col}' not found in DataFrame")

    # Work only with rows that have valid dates for splitting
    has_date = df[date_col].notna()
    df_dated = df[has_date].copy()
    df_no_date = df[~has_date].copy()

    if len(df_dated) == 0:
        raise ValueError(f"No valid dates found in column '{date_col}'")

    logger.info(
        "Splitting %d rows with valid dates (%d rows without dates excluded)",
        len(df_dated),
        len(df_no_date),
    )

    # Determine split date
    if split_date is None:
        sorted_dates = df_dated[date_col].sort_values()
        split_idx = int(len(sorted_dates) * (1 - test_ratio))
        split_date = sorted_dates.iloc[split_idx].isoformat()
        logger.info("Auto-computed split date: %s (test_ratio=%.2f)", split_date, test_ratio)
    
    split_ts = pd.Timestamp(split_date)

    train_df = (
        df_dated[df_dated[date_col] <= split_ts]
        .sort_values(date_col)
        .reset_index(drop=True)
        .copy()
    )
    test_df = (
        df_dated[df_dated[date_col] > split_ts]
        .sort_values(date_col)
        .reset_index(drop=True)
        .copy()
    )

    # Validation: no temporal overlap
    train_max = train_df[date_col].max()
    test_min = test_df[date_col].min()
    assert train_max < test_min, (
        f"Temporal overlap detected! train max={train_max}, test min={test_min}"
    )

    logger.info(
        "Split result: train=%d rows [..%s], test=%d rows [%s..]",
        len(train_df),
        train_max.strftime("%Y-%m-%d"),
        len(test_df),
        test_min.strftime("%Y-%m-%d"),
    )

    return train_df, test_df


def save_raw_splits(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    date_col: str = "tender_datePublished",
) -> None:
    """Save train/test raw splits to disk and record metadata."""
    TRAIN_DIR.mkdir(parents=True, exist_ok=True)
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    train_path = TRAIN_DIR / "raw.parquet"
    test_path = TEST_DIR / "raw.parquet"

    train_df.to_parquet(train_path, index=False, engine="pyarrow")
    test_df.to_parquet(test_path, index=False, engine="pyarrow")

    # Record split metadata
    metadata = {
        "split_date": str(train_df[date_col].max()),
        "train_count": len(train_df),
        "test_count": len(test_df),
        "train_date_range": {
            "min": str(train_df[date_col].min()),
            "max": str(train_df[date_col].max()),
        },
        "test_date_range": {
            "min": str(test_df[date_col].min()),
            "max": str(test_df[date_col].max()),
        },
        "date_column": date_col,
    }

    SPLIT_METADATA.write_text(
        json.dumps(metadata, indent=2, default=str), encoding="utf-8"
    )
    logger.info("Split metadata saved to %s", SPLIT_METADATA)


def load_raw_split(partition: str) -> pd.DataFrame:
    """Load a raw split partition ('train' or 'test')."""
    if partition == "train":
        path = TRAIN_DIR / "raw.parquet"
    elif partition == "test":
        path = TEST_DIR / "raw.parquet"
    else:
        raise ValueError(f"Unknown partition: '{partition}'. Use 'train' or 'test'.")

    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Run the raw split first."
        )
    return pd.read_parquet(path)


# ---------------------------------------------------------------------------
# Internal development sub-splits (Task 6)
# ---------------------------------------------------------------------------


def internal_dev_splits(
    train_df: pd.DataFrame,
    date_col: str = "tender_datePublished",
    val_hpo_ratio: float = 0.15,
    val_cal_ratio: float = 0.10,
) -> dict[str, pd.DataFrame]:
    """Create internal development sub-splits within train_data only.

    Returns dict with keys: 'train_fit', 'val_hpo', 'val_calibration'.

    All splits are temporal:
        train_fit → oldest data (for model fitting)
        val_hpo → middle data (for hyperparameter optimization)
        val_calibration → newest train data (for calibration)

    IMPORTANT: test_data/ is never touched here.
    """
    if date_col not in train_df.columns:
        raise ValueError(f"Date column '{date_col}' not found")

    df = train_df.dropna(subset=[date_col]).sort_values(date_col).copy()

    n = len(df)
    cal_start = int(n * (1 - val_cal_ratio))
    hpo_start = int(n * (1 - val_cal_ratio - val_hpo_ratio))

    train_fit = df.iloc[:hpo_start].copy()
    val_hpo = df.iloc[hpo_start:cal_start].copy()
    val_calibration = df.iloc[cal_start:].copy()

    # Verify temporal ordering
    assert train_fit[date_col].max() <= val_hpo[date_col].min(), "train_fit/val_hpo overlap"
    assert val_hpo[date_col].max() <= val_calibration[date_col].min(), "val_hpo/val_cal overlap"

    logger.info(
        "Dev splits: train_fit=%d, val_hpo=%d, val_calibration=%d",
        len(train_fit),
        len(val_hpo),
        len(val_calibration),
    )

    return {
        "train_fit": train_fit,
        "val_hpo": val_hpo,
        "val_calibration": val_calibration,
    }


def save_dev_split_manifest(
    splits: dict[str, pd.DataFrame],
    date_col: str = "tender_datePublished",
) -> None:
    """Save the dev split boundaries to manifest file."""
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {}
    for name, df in splits.items():
        valid = df[date_col].dropna()
        manifest[name] = {
            "count": len(df),
            "date_min": str(valid.min()) if len(valid) > 0 else None,
            "date_max": str(valid.max()) if len(valid) > 0 else None,
        }

    DEV_SPLIT_MANIFEST.write_text(
        json.dumps(manifest, indent=2, default=str), encoding="utf-8"
    )
    logger.info("Dev split manifest saved to %s", DEV_SPLIT_MANIFEST)

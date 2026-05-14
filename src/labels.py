"""Weak-labeling and calibration-sample utilities.

Implements ICW-style Potential Fraud Analysis (PFA) heuristic red-flag
indicators for procurement risk classification.

IMPORTANT:
- Labels are HEURISTIC risk indicators, NOT confirmed fraud outcomes.
- Expanding-window rules use past-only history (no look-ahead).
- Circularity risk between red-flag features and red-flag labels is
  acknowledged and documented for Bab 2/Bab 3.
"""

from __future__ import annotations

import logging
from pathlib import Path
import json
import warnings
from typing import Optional

import numpy as np
import pandas as pd

from src.data import PROJECT_ROOT

logger = logging.getLogger(__name__)

TRAIN_DIR = PROJECT_ROOT / "train_data"
TEST_DIR = PROJECT_ROOT / "test_data"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
 
LABEL_NAMES = {0: "Rendah", 1: "Sedang", 2: "Tinggi"}
CALIBRATION_SOURCE_INDEX_COL = "source_row_idx"
 
_DEV_MANIFEST = Path("data/processed/dev_split_manifest.json")


# ---------------------------------------------------------------------------
# Individual red-flag indicators (ICW PFA-based)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
 
 
def _price_deviation_ratio(row: pd.Series) -> float:
    """(awarded_price - hps) / hps.  NaN if hps is missing or zero."""
    hps = row.get("hps_value", np.nan)
    awarded = row.get("awarded_value", np.nan)
    if pd.isna(hps) or hps == 0 or pd.isna(awarded):
        return np.nan
    return (awarded - hps) / hps
 
 
def _single_bid_flag(row: pd.Series) -> int:
    """1 if only one bid was submitted."""
    n = row.get("bid_count", np.nan)
    if pd.isna(n):
        return 0
    return int(n <= 1)
 
 
def _short_window_flag(row: pd.Series, threshold_days: int = 3) -> int:
    """1 if the bid submission window was unusually short."""
    days = row.get("bid_window_days", np.nan)
    if pd.isna(days):
        return 0
    return int(days <= threshold_days)
 
 
def _repeat_winner_flag(row: pd.Series, history: Optional[pd.DataFrame] = None) -> int:
    """
    1 if the same supplier won from the same buyer in the past 12 months.
    Requires past-only history (expanding window).  Returns 0 when history
    is unavailable so the feature is nullable but never forward-leaking.
    """
    if history is None or history.empty:
        return 0
    supplier = row.get("winner_supplier_id")
    buyer = row.get("buyer_id")
    tender_date = row.get("tender_date")
    if pd.isna(supplier) or pd.isna(buyer) or pd.isna(tender_date):
        return 0
    cutoff = tender_date - pd.Timedelta(days=365)
    mask = (
        (history["winner_supplier_id"] == supplier)
        & (history["buyer_id"] == buyer)
        & (history["tender_date"] >= cutoff)
        & (history["tender_date"] < tender_date)
    )
    return int(mask.any())
 
 
# ---------------------------------------------------------------------------
# Weak-label rule (ICW-style)
# ---------------------------------------------------------------------------
 
# Thresholds – documented so the proposal can cite them
PRICE_DEV_HIGH = 0.02    # ≤2% below HPS → suspicious
PRICE_DEV_LOW = -0.30    # >30% below HPS → also suspicious (extremely low bid)
MIN_BIDDERS_MEDIUM = 2   # fewer than this → medium risk boost
MIN_BIDDERS_LOW = 3      # at least this many bidders required for low risk
 
 
def assign_heuristic_label(
    row: pd.Series,
    past_history: Optional[pd.DataFrame] = None,
) -> int:
    """
    Assign a heuristic risk label (0 / 1 / 2) to a single procurement record.
 
    Expanding-window features (repeat_winner) require `past_history`, which
    must contain only rows with tender_date < row.tender_date.
    """
    score = 0
 
    # --- single-bid flag ---
    if _single_bid_flag(row):
        score += 2
 
    # --- short window ---
    if _short_window_flag(row):
        score += 1
 
    # --- price deviation near HPS ---
    pdr = _price_deviation_ratio(row)
    if not pd.isna(pdr):
        if PRICE_DEV_LOW <= pdr <= PRICE_DEV_HIGH:
            score += 2
        elif pdr > PRICE_DEV_HIGH:
            # awarded above HPS – data error or emergency procurement
            score += 1
 
    # --- repeat winner ---
    if _repeat_winner_flag(row, history=past_history):
        score += 1
 
    # --- bid count (separate from single-bid) ---
    n_bidders = row.get("bid_count", np.nan)
    if not pd.isna(n_bidders):
        if n_bidders < MIN_BIDDERS_MEDIUM:
            score += 1
        elif n_bidders < MIN_BIDDERS_LOW:
            score += 0  # neutral
 
    # --- map score to class ---
    if score >= 4:
        return 2  # Tinggi
    elif score >= 2:
        return 1  # Sedang
    else:
        return 0  # Rendah
 
 
def label_dataframe(
    df: pd.DataFrame,
    date_col: str = "tender_date",
) -> pd.DataFrame:
    """
    Apply expanding-window heuristic labeling to an entire DataFrame.
 
    The DataFrame must already be sorted by `date_col` ascending.
    Past history for each row contains only rows with earlier dates,
    satisfying the no-look-ahead requirement.
 
    Returns the DataFrame with a new column `heuristic_label`.
    """
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.sort_values(date_col).reset_index(drop=True)
 
    labels = []
    for i, row in df.iterrows():
        past = df.loc[:i - 1] if i > 0 else pd.DataFrame()
        labels.append(assign_heuristic_label(row, past_history=past))
 
    df["heuristic_label"] = labels
    return df
 
 
# ---------------------------------------------------------------------------
# Task 14: Calibration sample selection helpers
# ---------------------------------------------------------------------------
 
 
def select_calibration_samples(
    features_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    model,  # fitted XGBClassifier
    manifest_path: Path = _DEV_MANIFEST,
    target_n: int = 120,
    random_state: int = 42,
) -> pd.DataFrame:
    """
    Select calibration review samples from ``val_calibration`` only.
 
    Parameters
    ----------
    features_df : features for the train split (all sub-splits combined)
    labels_df   : labels for the train split
    model       : fitted XGBClassifier
    manifest_path : path to dev_split_manifest.json
    target_n    : number of rows to sample (default 120, buffer above 80)
    random_state : reproducibility seed
 
    Returns
    -------
    DataFrame with columns:
        tender_id, heuristic_label, model_pred_class,
        model_proba_0, model_proba_1, model_proba_2,
        verified_label, review_notes
 
    ``verified_label`` and ``review_notes`` are pre-filled with empty strings
    for the reviewer to complete.
    """
    if not manifest_path.exists():
        raise FileNotFoundError(
            f"Dev split manifest not found: {manifest_path}.  "
            "Run Task 6 first."
        )
 
    with open(manifest_path) as f:
        manifest = json.load(f)
 
    cal_ids = set(manifest.get("val_calibration", {}).get("tender_ids", []))
    if not cal_ids:
        # Fall back to date range
        cal_start = manifest.get("val_calibration", {}).get("start_date")
        cal_end = manifest.get("val_calibration", {}).get("end_date")
        if cal_start and cal_end and "tender_date" in features_df.columns:
            mask = (
                (features_df["tender_date"] >= cal_start)
                & (features_df["tender_date"] <= cal_end)
            )
            cal_features = features_df[mask]
            cal_labels = labels_df[mask]
        else:
            raise ValueError(
                "val_calibration section in manifest has neither tender_ids "
                "nor start_date/end_date.  Cannot select calibration samples."
            )
    else:
        id_col = "tender_id" if "tender_id" in features_df.columns else features_df.index.name
        if id_col and id_col in features_df.columns:
            mask = features_df[id_col].isin(cal_ids)
        else:
            mask = features_df.index.isin(cal_ids)
        cal_features = features_df[mask]
        cal_labels = labels_df[mask]
 
    if len(cal_features) == 0:
        warnings.warn(
            "val_calibration subset is empty.  Calibration will be skipped.",
            UserWarning,
        )
        return pd.DataFrame()
 
    # ---- model predictions ------------------------------------------------
    numeric_cols = cal_features.select_dtypes(include="number").columns.tolist()
    X_cal = cal_features[numeric_cols].values.astype(np.float32)
 
    proba = model.predict_proba(X_cal)        # (n, 3)
    pred_class = np.argmax(proba, axis=1)
 
    # ---- uncertainty score (entropy) for sorting --------------------------
    eps = 1e-9
    entropy = -np.sum(proba * np.log(proba + eps), axis=1)
 
    # ---- stratified sample ------------------------------------------------
    result_df = cal_features.copy()
    if "tender_id" not in result_df.columns:
        result_df["tender_id"] = result_df.index.astype(str)
 
    result_df = result_df[["tender_id"]].copy()
    result_df["heuristic_label"] = cal_labels["heuristic_label"].values if "heuristic_label" in cal_labels.columns else -1
    result_df["model_pred_class"] = pred_class
    result_df["model_proba_0"] = proba[:, 0].round(4)
    result_df["model_proba_1"] = proba[:, 1].round(4)
    result_df["model_proba_2"] = proba[:, 2].round(4)
    result_df["entropy"] = entropy
    result_df["verified_label"] = ""
    result_df["review_notes"] = ""
 
    # Sort by uncertainty descending (most ambiguous first)
    result_df = result_df.sort_values("entropy", ascending=False)
 
    # Stratified by heuristic label
    per_class = target_n // 3
    sampled_parts = []
    rng = np.random.default_rng(random_state)
    for cls in [0, 1, 2]:
        cls_rows = result_df[result_df["heuristic_label"] == cls]
        n_take = min(per_class, len(cls_rows))
        sampled_parts.append(cls_rows.iloc[:n_take])
 
    sampled = pd.concat(sampled_parts).drop_duplicates("tender_id")
    # Top up if needed
    remaining = result_df[~result_df["tender_id"].isin(sampled["tender_id"])]
    if len(sampled) < target_n:
        top_up = remaining.iloc[: target_n - len(sampled)]
        sampled = pd.concat([sampled, top_up])
 
    return sampled.drop(columns=["entropy"]).reset_index(drop=True)
 
 
def load_verified_labels(
    path: Path = Path("data/processed/clean_labels_100.csv"),
) -> pd.DataFrame:
    """
    Load and validate the reviewed calibration CSV.
 
    Returns only rows where verified_label is a valid integer (0/1/2).
    Rows marked UNCERTAIN are silently dropped.
    """
    if not path.exists():
        raise FileNotFoundError(f"Calibration CSV not found: {path}")
 
    df = pd.read_csv(path, dtype={"verified_label": str})
    df = df[df["verified_label"].str.strip().isin(["0", "1", "2"])].copy()
    df["verified_label"] = df["verified_label"].astype(int)
    return df


def flag_single_bidder(df: pd.DataFrame) -> pd.Series:
    """Red flag: single bidder (numberOfTenderers == 1).

    Indicates limited competition, a common collusion signal.
    Returns a binary (0/1) pd.Series.
    """
    n = df.get("tender_numberOfTenderers")
    if n is None:
        return pd.Series(0, index=df.index, dtype=int)
    return (n.fillna(-1).astype(float) == 1.0).astype(int)


def flag_short_title(df: pd.DataFrame, threshold: int = 20) -> pd.Series:
    """Red flag: tender title shorter than threshold characters.

    Short titles may indicate copy-paste or template fraud.
    Returns a binary (0/1) pd.Series.
    """
    title = df.get("tender_title", pd.Series("", index=df.index))
    return (title.fillna("").str.len() < threshold).astype(int)


def flag_short_description(df: pd.DataFrame, threshold: int = 60) -> pd.Series:
    """Red flag: tender description shorter than threshold characters.

    Short descriptions suggest inadequate specification.
    Returns a binary (0/1) pd.Series.
    """
    desc = df.get("tender_description", pd.Series("", index=df.index))
    return (desc.fillna("").str.len() < threshold).astype(int)


def flag_q4_timing(df: pd.DataFrame) -> pd.Series:
    """Red flag: procurement in Q4 (Oct-Dec).

    Year-end fiscal rush correlates with higher irregularity risk.
    Returns a binary (0/1) pd.Series.
    """
    date_col = "tender_datePublished"
    if date_col not in df.columns:
        return pd.Series(0, index=df.index, dtype=int)

    month = pd.to_datetime(df[date_col], errors="coerce").dt.month
    return month.isin([10, 11, 12]).fillna(False).astype(int)


def flag_price_deviation(df: pd.DataFrame) -> pd.Series:
    """Red flag: award value deviates significantly from tender estimate.

    A ratio very close to 1.0 (ceiling price) or very low (<0.7) is suspicious.
    Returns a binary (0/1) pd.Series.
    """
    tender_val = pd.to_numeric(df.get("tender_value_amount"), errors="coerce")
    award_val = pd.to_numeric(df.get("award_value_amount"), errors="coerce")

    ratio = award_val / tender_val.replace(0, np.nan)

    # Flag if ratio >= 1.0 (suspiciously close to ceiling)
    # or ratio <= 0.7 (suspiciously low)
    suspicious = (ratio >= 1.0) | (ratio <= 0.7)
    return suspicious.fillna(False).astype(int)


def flag_high_value(df: pd.DataFrame, percentile: float = 0.9) -> pd.Series:
    """Red flag: contract value above the given percentile.

    High-value contracts attract more corruption risk.
    Returns a binary (0/1) pd.Series.
    """
    val = pd.to_numeric(df.get("tender_value_amount"), errors="coerce")
    threshold = val.quantile(percentile)
    return (val >= threshold).fillna(False).astype(int)


def flag_repeat_pair_history(df: pd.DataFrame, min_repeat: int = 2) -> pd.Series:
    """Red flag: buyer-supplier pair has repeated historical interactions.

    Uses the pre-computed feature column if available, otherwise computes
    pair counts from raw buyer_id/supplier_id columns.
    Returns a binary (0/1) pd.Series.
    """
    col = "f_buyer_supplier_repeat_count"
    if col in df.columns:
        repeat_count = pd.to_numeric(df[col], errors="coerce")
        return (repeat_count >= min_repeat).fillna(0).astype(int)

    # Fallback: compute from raw columns
    buyer = df.get("buyer_id", pd.Series(dtype="object", index=df.index))
    supplier = df.get("supplier_id", pd.Series(dtype="object", index=df.index))
    # Only count pairs where both buyer and supplier are non-null
    valid_mask = buyer.notna() & supplier.notna()
    pair = buyer.astype(str) + "||" + supplier.astype(str)
    pair_counts = pair.where(valid_mask).map(pair[valid_mask].value_counts())
    return (pair_counts >= min_repeat).fillna(0).astype(int)


def flag_supplier_recent_surge(df: pd.DataFrame) -> pd.Series:
    """Red flag: supplier has a recent surge in 90-day award activity.

    Uses the pre-computed feature column if available, otherwise computes
    from raw supplier_id column using total occurrence count as proxy.
    Returns a binary (0/1) pd.Series.
    """
    min_recent_awards = 3
    col = "f_supplier_recent_90d_award_count"
    if col in df.columns:
        recent_awards = pd.to_numeric(df[col], errors="coerce")
        return (recent_awards >= min_recent_awards).fillna(0).astype(int)

    # Fallback: compute from raw columns (approximate using total supplier count)
    supplier = df.get("supplier_id", pd.Series(dtype="object", index=df.index))
    valid_mask = supplier.notna()
    supplier_counts = supplier.where(valid_mask).map(
        supplier[valid_mask].value_counts()
    )
    return (supplier_counts >= min_recent_awards).fillna(0).astype(int)


def flag_buyer_value_spike(df: pd.DataFrame, z_threshold: float = 2.0) -> pd.Series:
    """Red flag: tender value is an unusually large spike for the buyer.

    Uses the pre-computed feature column if available, otherwise computes
    z-score from raw buyer_id and tender_value_amount columns.
    Returns a binary (0/1) pd.Series.
    """
    col = "f_tender_value_zscore_buyer"
    if col in df.columns:
        buyer_zscore = pd.to_numeric(df[col], errors="coerce")
        return (buyer_zscore >= z_threshold).fillna(0).astype(int)

    # Fallback: compute z-score per buyer from raw columns
    buyer = df.get("buyer_id", pd.Series("", index=df.index)).fillna("")
    val = pd.to_numeric(df.get("tender_value_amount"), errors="coerce")
    buyer_mean = val.groupby(buyer).transform("mean")
    buyer_std = val.groupby(buyer).transform("std")
    zscore = (val - buyer_mean) / buyer_std.replace(0, np.nan)
    return (zscore >= z_threshold).fillna(0).astype(int)


def flag_direct_procurement(df: pd.DataFrame) -> pd.Series:
    """Red flag: non-competitive procurement method.

    Direct / limited procurement bypasses open competition.
    Returns a binary (0/1) pd.Series.
    """
    method = df.get("tender_procurementMethod", pd.Series("", index=df.index))
    method_lower = method.fillna("").str.lower()
    # In Indonesian OCDS: "direct", "limited", "selective", "penunjukan langsung"
    return method_lower.isin(["direct", "limited", "selective"]).astype(int)


# ---------------------------------------------------------------------------
# Composite risk labeling
# ---------------------------------------------------------------------------

# All available red-flag functions
RED_FLAG_FUNCTIONS = {
    "single_bidder": flag_single_bidder,
    "short_title": flag_short_title,
    "short_description": flag_short_description,
    "q4_timing": flag_q4_timing,
    "price_deviation": flag_price_deviation,
    "high_value": flag_high_value,
    "repeat_pair_history": flag_repeat_pair_history,
    "supplier_recent_surge": flag_supplier_recent_surge,
    "buyer_value_spike": flag_buyer_value_spike,
    "direct_procurement": flag_direct_procurement,
}


def compute_red_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all individual red-flag columns.

    ``df`` is expected to be the merged label-input frame that combines
    raw procurement columns with engineered feature columns.

    Returns a DataFrame with boolean (0/1) columns, one per flag.

    DISCLAIMER: These flags are heuristic risk indicators derived from
    procurement data patterns. They are NOT verified fraud findings,
    legal determinations, or evidence of wrongdoing. They serve as
    training signals for the risk scoring model only.
    """
    flags = pd.DataFrame(index=df.index)
    for name, func in RED_FLAG_FUNCTIONS.items():
        flags[f"flag_{name}"] = func(df)
    return flags


def compute_risk_labels(
    df: pd.DataFrame,
    low_max: int = 0,
    high_min: int = 3,
) -> pd.DataFrame:
    """Assign heuristic risk labels based on red-flag count.

    Risk classes:
        0 = Low Risk    (0 flags triggered)
        1 = Medium Risk (1-2 flags triggered)
        2 = High Risk   (3+ flags triggered)

    Parameters
    ----------
    df : pd.DataFrame
        Merged label-input data containing both raw procurement fields and
        engineered feature columns. Callers should concatenate raw + feature
        frames before invoking this function; passing raw-only data will omit
        feature-backed rules such as repeat pair history, supplier surge,
        and buyer value spike.
    low_max : int
        Max flag count for "low risk" class.
    high_min : int
        Min flag count for "high risk" class.

    Returns
    -------
    pd.DataFrame with columns: all flag columns + 'flag_count' + 'risk_label'
    """
    flags = compute_red_flags(df)
    flags["flag_count"] = flags.sum(axis=1)

    flags["risk_label"] = np.where(
        flags["flag_count"] <= low_max,
        0,  # Low Risk
        np.where(
            flags["flag_count"] >= high_min,
            2,  # High Risk
            1,  # Medium Risk
        ),
    )

    logger.info(
        "Label distribution: Low=%d, Medium=%d, High=%d",
        (flags["risk_label"] == 0).sum(),
        (flags["risk_label"] == 1).sum(),
        (flags["risk_label"] == 2).sum(),
    )

    return flags


# ---------------------------------------------------------------------------
# Save labels
# ---------------------------------------------------------------------------


def save_labels(labels: pd.DataFrame, partition: str) -> Path:
    """Save label artifacts.

    Parameters
    ----------
    partition : str
        Either 'train' or 'test'.
    """
    if partition == "train":
        out_dir = TRAIN_DIR
    elif partition == "test":
        out_dir = TEST_DIR
    else:
        raise ValueError(f"Unknown partition: '{partition}'")

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "labels.parquet"
    labels.to_parquet(path, index=False, engine="pyarrow")
    logger.info("Saved %d labels to %s", len(labels), path)
    return path


# ---------------------------------------------------------------------------
# Calibration sample helpers (Task 14)
# ---------------------------------------------------------------------------


def select_calibration_samples(
    labels: pd.DataFrame,
    raw_df: pd.DataFrame,
    n_samples: int = 100,
    seed: int = 42,
) -> pd.DataFrame:
    """Select a stratified sample from val_calibration for human review.

    Produces a human-readable table with:
      - Procurement context (OCID, title, values, buyer, supplier)
      - All 7 red-flag indicators and total flag count
      - Heuristic risk_label (the label being verified)
      - Empty review columns (verified_label, confidence, notes)

    Samples are drawn proportionally from each risk class.

    IMPORTANT: This function must only receive val_calibration data,
    never test_data.
    """
    # Reset indices for safe alignment
    labels_reset = labels.reset_index(drop=True)
    raw_reset = raw_df.reset_index(drop=True)

    # Build combined table with reviewer context
    combined = labels_reset.copy()
    combined[CALIBRATION_SOURCE_INDEX_COL] = combined.index

    # Context columns from raw data
    context_cols = [
        "ocid",
        "tender_title",
        "tender_datePublished",
        "tender_procurementMethod",
        "tender_numberOfTenderers",
        "tender_value_amount",
        "award_value_amount",
        "buyer_name",
        "supplier_name",
    ]
    for col in context_cols:
        if col in raw_reset.columns and len(raw_reset) >= len(combined):
            combined[col] = raw_reset[col].iloc[: len(combined)].values

    # Stratified sampling across risk classes
    samples = combined.groupby("risk_label", group_keys=False).apply(
        lambda x: x.sample(
            n=min(len(x), max(1, int(n_samples * len(x) / len(combined)))),
            random_state=seed,
        )
    )

    # Add empty review columns for human reviewer
    samples["verified_label"] = np.nan
    samples["confidence"] = ""
    samples["notes"] = ""

    # Reorder columns for clarity: context → flags → heuristic label → review
    flag_cols = [c for c in samples.columns if c.startswith("flag_")]
    review_cols = ["verified_label", "confidence", "notes"]
    meta_cols = ["risk_label"]
    context_present = [c for c in context_cols if c in samples.columns]
    ordered = [CALIBRATION_SOURCE_INDEX_COL] + context_present + flag_cols + meta_cols + review_cols
    remaining = [c for c in samples.columns if c not in ordered]
    samples = samples[ordered + remaining]

    logger.info("Selected %d calibration samples (from %d total)", len(samples), len(combined))
    return samples


def save_calibration_sheet(samples: pd.DataFrame, path: Path | None = None) -> Path:
    """Save calibration sheet as CSV for human editing.

    CSV format is chosen because:
    - Humans can open and edit in Excel/Google Sheets
    - Git can diff changes
    - No special tooling required
    """
    from src.data import PROCESSED_DIR

    path = path or (PROCESSED_DIR / "calibration_sheet_100.csv")
    path.parent.mkdir(parents=True, exist_ok=True)
    samples.to_csv(path, index=False, encoding="utf-8-sig")
    logger.info("Calibration sheet saved to %s (%d rows)", path, len(samples))
    return path

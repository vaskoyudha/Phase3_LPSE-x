"""Feature engineering utilities for split-aware procurement features.

Tier 1 features are computed directly from the target rows.
Tier 2 features may optionally use prior-history rows as expanding-window
context, but never future rows.
All output columns are numeric-safe for downstream ONNX path.

Feature catalog:
  Tier 1 (15 families): direct from raw fields
  Tier 2 (19 families): temporal, dependency, and aggregated past-only windows
"""

from __future__ import annotations

from collections import deque
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from src.data import PROJECT_ROOT

logger = logging.getLogger(__name__)

TRAIN_DIR = PROJECT_ROOT / "train_data"
TEST_DIR = PROJECT_ROOT / "test_data"

# Canonical feature list — frozen after Task 9
FEATURE_CATALOG: list[str] = []


# ---------------------------------------------------------------------------
# Helper: safe numeric conversion
# ---------------------------------------------------------------------------


def _to_numeric(series: pd.Series | None) -> pd.Series:
    """Convert to numeric, coercing errors to NaN, then fill NaN with 0.

    Parameters
    ----------
    series : pd.Series | None
        Input series to convert. If None, returns an empty float64 Series.

    Returns
    -------
    pd.Series
        Numeric series with all NaN values replaced by 0.
    """
    if series is None:
        return pd.Series(dtype="float64")
    return pd.to_numeric(series, errors="coerce").fillna(0)


def _safe_log1p(series: pd.Series | None) -> pd.Series:
    """Apply np.log1p to a numeric series, handling None/NaN gracefully.

    Parameters
    ----------
    series : pd.Series | None
        Input series. If None, returns an empty float64 Series.
        Non-numeric values are coerced to NaN then treated as 0.

    Returns
    -------
    pd.Series
        log1p-transformed numeric series. Negative values are clipped to 0
        before transformation. NaN values produce log1p(0) = 0.
    """
    if series is None:
        return pd.Series(dtype="float64")
    vals = pd.to_numeric(series, errors="coerce").fillna(0)
    return np.log1p(vals.clip(lower=0))


def _safe_len(series: pd.Series) -> pd.Series:
    """Get string length of each element, returning 0 for NaN/None.

    Parameters
    ----------
    series : pd.Series
        Input series of strings (or mixed types).

    Returns
    -------
    pd.Series
        Integer series of string lengths. NaN/None values produce length 0.
    """
    return series.fillna("").astype(str).str.len()


def _safe_token_count(series: pd.Series | None) -> pd.Series:
    """Count whitespace-separated tokens in a string series.

    Parameters
    ----------
    series : pd.Series | None
        Input series of strings. If None, returns an empty float64 Series.

    Returns
    -------
    pd.Series
        Numeric series of token counts. NaN/None values produce count 0.
    """
    if series is None:
        return pd.Series(dtype="float64")
    return series.fillna("").astype(str).str.split().str.len().astype(float)


def _parse_dates(series: pd.Series) -> pd.Series:
    """Parse a series to datetime, coercing errors to NaT.

    Parameters
    ----------
    series : pd.Series
        Input series with date-like values.

    Returns
    -------
    pd.Series
        Datetime series (UTC-aware). Unparseable values become NaT.
    """
    return pd.to_datetime(series, errors="coerce", utc=True)


# ---------------------------------------------------------------------------
# Tier 1: Direct features from raw fields (15 families)
# ---------------------------------------------------------------------------


def tier1_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute Tier 1 features directly from raw procurement fields.

    Returns a DataFrame with 15 numeric feature columns.
    """
    feats = pd.DataFrame(index=df.index)

    # 1. Tender value (log-scaled)
    feats["f_tender_value_log"] = _safe_log1p(df.get("tender_value_amount"))

    # 2. Award value (log-scaled)
    feats["f_award_value_log"] = _safe_log1p(df.get("award_value_amount"))

    # 3. Price deviation ratio (award / tender estimate)
    # Use raw numeric (without fillna) so division by missing stays NaN
    tender_val = pd.to_numeric(
        df.get("tender_value_amount", pd.Series(np.nan, index=df.index)),
        errors="coerce",
    )
    award_val = pd.to_numeric(
        df.get("award_value_amount", pd.Series(np.nan, index=df.index)),
        errors="coerce",
    )
    feats["f_price_deviation_ratio"] = award_val / tender_val.replace(0, np.nan)

    # 4. Main procurement category (encoded: goods=0, services=1, works=2)
    feats["f_main_procurement_category_enc"] = (
        df.get("tender_mainProcurementCategory", pd.Series("", index=df.index))
        .fillna("")
        .str.lower()
        .map({"goods": 0, "services": 1, "works": 2})
        .fillna(-1)
        .astype(float)
    )

    # 5. Award duration (days from tender start to award)
    start = _parse_dates(df.get("tender_tenderPeriod_startDate"))
    award_date = _parse_dates(df.get("award_date"))
    feats["f_award_duration_days"] = (award_date - start).dt.total_seconds() / 86400

    # 6. Tender items count
    feats["f_tender_items_count"] = _to_numeric(
        df.get("tender_items_count", pd.Series(np.nan, index=df.index))
    ).fillna(0)

    # 7. Award items count
    feats["f_award_items_count"] = _to_numeric(
        df.get("award_items_count", pd.Series(np.nan, index=df.index))
    ).fillna(0)

    # 8. Title length
    feats["f_title_length"] = _safe_len(df.get("tender_title")).astype(float)

    # 9. Description length
    feats["f_description_length"] = _safe_len(
        df.get("tender_description")
    ).astype(float)

    # 10. Tender value missingness flag
    feats["f_tender_value_missing"] = pd.to_numeric(
        df.get("tender_value_amount", pd.Series(np.nan, index=df.index)),
        errors="coerce",
    ).isna().astype(float)

    # 11. Is Q4 (October-December)
    pub_date = _parse_dates(df.get("tender_datePublished"))
    feats["f_is_q4"] = pub_date.dt.month.isin([10, 11, 12]).astype(float)

    # 12. Is December specifically
    feats["f_is_december"] = (pub_date.dt.month == 12).astype(float)

    # 13. Award value missingness flag
    feats["f_award_value_missing"] = pd.to_numeric(
        df.get("award_value_amount", pd.Series(np.nan, index=df.index)),
        errors="coerce",
    ).isna().astype(float)

    # 14. Title token count
    feats["f_title_token_count"] = _safe_token_count(df.get("tender_title"))

    # 15. Description token count
    feats["f_description_token_count"] = _safe_token_count(
        df.get("tender_description")
    )

    return feats


# ---------------------------------------------------------------------------
# Tier 2: Temporal and aggregated features (19 families)
# ---------------------------------------------------------------------------


def tier2_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute Tier 2 features using expanding-window (past-only) aggregations.

    CRITICAL: For each row, only data from BEFORE that row's tender date
    is used. This is the anti-leakage guarantee.

    Returns a DataFrame with 19 numeric feature columns.
    """
    feats = pd.DataFrame(index=df.index)

    # Sort by date for expanding-window correctness
    date_col = "tender_datePublished"
    dates = _parse_dates(df.get(date_col))
    # Use raw numeric (without fillna) so NaN checks work in expanding windows
    tender_val = pd.to_numeric(df.get("tender_value_amount"), errors="coerce")
    award_val = pd.to_numeric(df.get("award_value_amount"), errors="coerce")
    buyer_id = df.get("buyer_id", pd.Series("", index=df.index)).fillna("")
    supplier_id = df.get("supplier_id", pd.Series("", index=df.index)).fillna("")

    # We need sorted order for expanding-window calculations
    sort_idx = dates.sort_values(kind="mergesort").index.to_numpy()
    df_sorted = df.iloc[sort_idx].copy()
    dates_sorted = dates.iloc[sort_idx]

    # Pre-compute sorted series
    buyer_sorted = buyer_id.iloc[sort_idx]
    supplier_sorted = supplier_id.iloc[sort_idx]
    tender_val_sorted = tender_val.iloc[sort_idx]
    award_val_sorted = award_val.iloc[sort_idx]

    # Initialize result arrays (will be filled in sorted order, then reindexed)
    n = len(df)

    # Helper: expanding window stats per group
    def _expanding_group_stat(group_col, value_col, stat="mean"):
        """Compute expanding-window stat per group using past-only data."""
        result = pd.Series(np.nan, index=range(n))
        group_count: dict[str, int] = {}
        group_sum: dict[str, float] = {}
        group_sumsq: dict[str, float] = {}
        group_max: dict[str, float] = {}

        for i in range(n):
            g = group_col.iloc[i]
            v = value_col.iloc[i]

            count = group_count.get(g, 0) if g else 0
            if g and count > 0:
                if stat == "mean":
                    result.iloc[i] = group_sum[g] / count
                elif stat == "std":
                    if count > 1:
                        mean = group_sum[g] / count
                        variance = max((group_sumsq[g] / count) - (mean**2), 0.0)
                        result.iloc[i] = float(np.sqrt(variance))
                    else:
                        result.iloc[i] = 0
                elif stat == "count":
                    result.iloc[i] = count
                elif stat == "max":
                    result.iloc[i] = group_max[g]

            # Add current value to history AFTER computing (past-only)
            if g and pd.notna(v):
                v_float = float(v)
                group_count[g] = count + 1
                group_sum[g] = group_sum.get(g, 0.0) + v_float
                group_sumsq[g] = group_sumsq.get(g, 0.0) + (v_float * v_float)
                group_max[g] = max(group_max.get(g, v_float), v_float)

        return result

    def _expanding_pair_count(g1_col, g2_col):
        """Count past interactions between a pair."""
        result = pd.Series(0.0, index=range(n))
        pair_history: dict[tuple, int] = {}

        for i in range(n):
            key = (g1_col.iloc[i], g2_col.iloc[i])
            if key[0] and key[1]:
                result.iloc[i] = pair_history.get(key, 0)
                pair_history[key] = pair_history.get(key, 0) + 1

        return result

    # 16. Buyer historical average tender value
    feats_sorted_16 = _expanding_group_stat(buyer_sorted, tender_val_sorted, "mean")

    # 17. Buyer historical value std (spending volatility)
    feats_sorted_17 = _expanding_group_stat(buyer_sorted, tender_val_sorted, "std")

    # 18. Supplier historical win count
    feats_sorted_18 = _expanding_group_stat(supplier_sorted, award_val_sorted, "count")

    # 19. Buyer-supplier repeat interaction count
    feats_sorted_19 = _expanding_pair_count(buyer_sorted, supplier_sorted)

    # 20. Buyer total past tender count
    feats_sorted_20 = _expanding_group_stat(buyer_sorted, tender_val_sorted, "count")

    # 21. Supplier historical max award value
    feats_sorted_21 = _expanding_group_stat(supplier_sorted, award_val_sorted, "max")

    # 22. Tender value z-score vs buyer history
    feats_sorted_22 = pd.Series(np.nan, index=range(n))
    buyer_hist_count: dict[str, int] = {}
    buyer_hist_sum: dict[str, float] = {}
    buyer_hist_sumsq: dict[str, float] = {}
    for i in range(n):
        b = buyer_sorted.iloc[i]
        v = tender_val_sorted.iloc[i]
        count = buyer_hist_count.get(b, 0) if b else 0
        if b and count > 1 and pd.notna(v):
            mean_h = buyer_hist_sum[b] / count
            variance_h = max((buyer_hist_sumsq[b] / count) - (mean_h**2), 0.0)
            std_h = float(np.sqrt(variance_h))
            if std_h > 0 and pd.notna(v):
                feats_sorted_22.iloc[i] = (v - mean_h) / std_h
        if b and pd.notna(v):
            v_float = float(v)
            buyer_hist_count[b] = count + 1
            buyer_hist_sum[b] = buyer_hist_sum.get(b, 0.0) + v_float
            buyer_hist_sumsq[b] = buyer_hist_sumsq.get(b, 0.0) + (v_float * v_float)

    # 23. Days since buyer's last tender
    feats_sorted_23 = pd.Series(np.nan, index=range(n))
    buyer_last_date: dict[str, pd.Timestamp] = {}
    for i in range(n):
        b = buyer_sorted.iloc[i]
        d = dates_sorted.iloc[i]
        if b and b in buyer_last_date and pd.notna(d):
            delta = (d - buyer_last_date[b]).total_seconds() / 86400
            feats_sorted_23.iloc[i] = delta
        if b and pd.notna(d):
            buyer_last_date[b] = d

    # 24. Buyer recent 30-day tender count
    feats_sorted_24 = pd.Series(0.0, index=range(n))
    buyer_recent_dates: dict[str, deque[pd.Timestamp]] = {}
    for i in range(n):
        b = buyer_sorted.iloc[i]
        d = dates_sorted.iloc[i]
        if b and pd.notna(d):
            history = buyer_recent_dates.setdefault(b, deque())
            cutoff = d - pd.Timedelta(days=30)
            while history and history[0] < cutoff:
                history.popleft()
            feats_sorted_24.iloc[i] = float(len(history))
            history.append(d)

    # 25. Supplier recent 90-day award count
    feats_sorted_25 = pd.Series(0.0, index=range(n))
    supplier_recent_dates: dict[str, deque[pd.Timestamp]] = {}
    for i in range(n):
        s = supplier_sorted.iloc[i]
        d = dates_sorted.iloc[i]
        if s and pd.notna(d):
            history = supplier_recent_dates.setdefault(s, deque())
            cutoff = d - pd.Timedelta(days=90)
            while history and history[0] < cutoff:
                history.popleft()
            feats_sorted_25.iloc[i] = float(len(history))
            history.append(d)

    # 26. Value growth rate for buyer (current / historical mean)
    feats_sorted_26 = pd.Series(np.nan, index=range(n))
    buyer_val_count: dict[str, int] = {}
    buyer_val_sum: dict[str, float] = {}
    for i in range(n):
        b = buyer_sorted.iloc[i]
        v = tender_val_sorted.iloc[i]
        count = buyer_val_count.get(b, 0) if b else 0
        if b and count > 0 and pd.notna(v):
            hist_mean = buyer_val_sum[b] / count
            if hist_mean > 0:
                feats_sorted_26.iloc[i] = v / hist_mean
        if b and pd.notna(v):
            buyer_val_count[b] = count + 1
            buyer_val_sum[b] = buyer_val_sum.get(b, 0.0) + float(v)

    # 27. Supplier capacity ratio (current award / historical max)
    feats_sorted_27 = pd.Series(np.nan, index=range(n))
    supplier_max_hist: dict[str, float] = {}
    for i in range(n):
        s = supplier_sorted.iloc[i]
        v = award_val_sorted.iloc[i]
        if s and s in supplier_max_hist and pd.notna(v):
            if supplier_max_hist[s] > 0:
                feats_sorted_27.iloc[i] = v / supplier_max_hist[s]
        if s and pd.notna(v):
            supplier_max_hist[s] = max(supplier_max_hist.get(s, 0), v)

    # 28-29. Price deviation statistics per buyer
    feats_sorted_28 = _expanding_group_stat(buyer_sorted, award_val_sorted, "mean")
    feats_sorted_29 = _expanding_group_stat(buyer_sorted, award_val_sorted, "std")

    # 30. Supplier historical average award value
    feats_sorted_30 = _expanding_group_stat(supplier_sorted, award_val_sorted, "mean")

    # 31-34. Buyer/supplier concentration and dependency features
    feats_sorted_31 = pd.Series(0.0, index=range(n))
    feats_sorted_32 = pd.Series(0.0, index=range(n))
    feats_sorted_33 = pd.Series(0.0, index=range(n))
    feats_sorted_34 = pd.Series(0.0, index=range(n))
    buyer_suppliers_seen: dict[str, set[str]] = {}
    supplier_buyers_seen: dict[str, set[str]] = {}
    buyer_partner_event_count: dict[str, int] = {}
    supplier_partner_event_count: dict[str, int] = {}
    pair_partner_history: dict[tuple[str, str], int] = {}
    for i in range(n):
        b = buyer_sorted.iloc[i]
        s = supplier_sorted.iloc[i]

        if b:
            feats_sorted_31.iloc[i] = float(len(buyer_suppliers_seen.get(b, set())))
        if s:
            feats_sorted_32.iloc[i] = float(len(supplier_buyers_seen.get(s, set())))

        if b and s:
            pair_key = (b, s)
            buyer_events = buyer_partner_event_count.get(b, 0)
            supplier_events = supplier_partner_event_count.get(s, 0)
            pair_events = pair_partner_history.get(pair_key, 0)
            if buyer_events > 0:
                feats_sorted_33.iloc[i] = float(pair_events / buyer_events)
            if supplier_events > 0:
                feats_sorted_34.iloc[i] = float(pair_events / supplier_events)

            buyer_suppliers_seen.setdefault(b, set()).add(s)
            supplier_buyers_seen.setdefault(s, set()).add(b)
            buyer_partner_event_count[b] = buyer_events + 1
            supplier_partner_event_count[s] = supplier_events + 1
            pair_partner_history[pair_key] = pair_events + 1

    # Map sorted results back to original index
    inverse_idx = sort_idx.argsort()

    feats["f_buyer_hist_avg_value"] = feats_sorted_16.values[inverse_idx]
    feats["f_buyer_hist_value_std"] = feats_sorted_17.values[inverse_idx]
    feats["f_supplier_hist_win_count"] = feats_sorted_18.values[inverse_idx]
    feats["f_buyer_supplier_repeat_count"] = feats_sorted_19.values[inverse_idx]
    feats["f_buyer_hist_tender_count"] = feats_sorted_20.values[inverse_idx]
    feats["f_supplier_hist_max_award"] = feats_sorted_21.values[inverse_idx]
    feats["f_tender_value_zscore_buyer"] = feats_sorted_22.values[inverse_idx]
    feats["f_days_since_last_buyer_tender"] = feats_sorted_23.values[inverse_idx]
    feats["f_buyer_recent_30d_tender_count"] = feats_sorted_24.values[inverse_idx]
    feats["f_supplier_recent_90d_award_count"] = feats_sorted_25.values[inverse_idx]
    feats["f_buyer_value_growth_rate"] = feats_sorted_26.values[inverse_idx]
    feats["f_supplier_capacity_ratio"] = feats_sorted_27.values[inverse_idx]
    feats["f_buyer_hist_avg_award"] = feats_sorted_28.values[inverse_idx]
    feats["f_buyer_hist_award_std"] = feats_sorted_29.values[inverse_idx]
    feats["f_supplier_hist_avg_award"] = feats_sorted_30.values[inverse_idx]
    feats["f_buyer_unique_suppliers_count"] = feats_sorted_31.values[inverse_idx]
    feats["f_supplier_unique_buyers_count"] = feats_sorted_32.values[inverse_idx]
    feats["f_pair_share_of_buyer_history"] = feats_sorted_33.values[inverse_idx]
    feats["f_pair_share_of_supplier_history"] = feats_sorted_34.values[inverse_idx]

    return feats


# ---------------------------------------------------------------------------
# Combined feature pipeline
# ---------------------------------------------------------------------------


def compute_all_features(
    df: pd.DataFrame,
    history_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Compute all 34 feature families (Tier 1 + Tier 2).

    Parameters
    ----------
    df : pd.DataFrame
        Target rows to featurize.
    history_df : pd.DataFrame | None
        Optional prior-history rows that should be visible to Tier 2
        expanding-window features. These rows are used only as historical
        context and are not included in the returned feature frame.

    Returns a DataFrame with 34 numeric columns, all ONNX-safe.
    """
    t1 = tier1_features(df)

    if history_df is not None and len(history_df) > 0:
        history_len = len(history_df)
        target_index = df.index
        tier2_context = pd.concat(
            [history_df.reset_index(drop=True), df.reset_index(drop=True)],
            axis=0,
            ignore_index=True,
        )
        t2 = tier2_features(tier2_context).iloc[history_len:].copy()
        t2.index = target_index
    else:
        t2 = tier2_features(df)

    combined = pd.concat([t1, t2], axis=1)

    # Update the frozen catalog
    global FEATURE_CATALOG
    FEATURE_CATALOG = list(combined.columns)

    logger.info("Computed %d features: %s", len(combined.columns), list(combined.columns))

    # Verify all numeric
    for col in combined.columns:
        if not pd.api.types.is_numeric_dtype(combined[col]):
            raise TypeError(f"Feature '{col}' is not numeric: {combined[col].dtype}")

    return combined


def save_features(features: pd.DataFrame, partition: str) -> Path:
    """Save feature artifacts for a partition."""
    if partition == "train":
        out_dir = TRAIN_DIR
    elif partition == "test":
        out_dir = TEST_DIR
    else:
        raise ValueError(f"Unknown partition: '{partition}'")

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "features.parquet"
    features.to_parquet(path, index=False, engine="pyarrow")
    logger.info("Saved %d features (%d rows) to %s", len(features.columns), len(features), path)
    return path

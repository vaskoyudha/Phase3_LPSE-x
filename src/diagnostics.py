"""Diagnostics and robustness helpers for Phase 2 evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, log_loss

from src.model import BEST_PARAMS_PATH, compute_sample_weights

SYNTHETIC_OCID_PREFIX = "ocds-synth-"
CLASS_NAMES = {0: "Low Risk", 1: "Medium Risk", 2: "High Risk"}

# Direct feature proxies to the heuristic risk rules in src.labels.
PROXY_CORE_FEATURES = [
    "f_title_length",
    "f_description_length",
    "f_title_token_count",
    "f_description_token_count",
    "f_is_q4",
    "f_is_december",
    "f_price_deviation_ratio",
    "f_tender_value_log",
    "f_buyer_supplier_repeat_count",
    "f_supplier_recent_90d_award_count",
    "f_tender_value_zscore_buyer",
]

# Broader set including near-proxies tied to value and contract amounts.
PROXY_BROAD_FEATURES = PROXY_CORE_FEATURES + [
    "f_award_value_log",
    "f_tender_value_missing",
    "f_award_value_missing",
    "f_buyer_recent_30d_tender_count",
    "f_buyer_hist_avg_value",
    "f_supplier_hist_max_award",
]

RETIRED_DEAD_FEATURES = [
    "f_tender_duration_days",
    "f_num_tenderers",
    "f_single_bidder",
    "f_procurement_method_enc",
    "f_contract_value_log",
    "f_contract_award_ratio",
    "f_days_to_contract",
    "f_buyer_method_diversity",
]

REVIEW_BENCHMARK_PATH = Path("data/processed/review_benchmark_500.csv")
MANUAL_REVIEW_SUMMARY_PATH = Path("data/processed/manual_review_summary.csv")
ROW_LEVEL_REVIEWED_BENCHMARK_PATH = Path("data/processed/review_benchmark_500_reviewed.csv")


def _iso(value) -> str | None:
    if pd.isna(value):
        return None
    return str(value)


def summarize_data_provenance(train_raw: pd.DataFrame, test_raw: pd.DataFrame) -> dict:
    """Summarize dataset provenance and whether the working data is synthetic."""
    combined = pd.concat([train_raw, test_raw], ignore_index=True)
    ocids = combined.get("ocid", pd.Series(dtype="object")).astype(str)
    synthetic_ratio = float(ocids.str.startswith(SYNTHETIC_OCID_PREFIX).mean()) if len(ocids) else 0.0
    is_synthetic = bool(len(ocids) and synthetic_ratio == 1.0)

    return {
        "data_kind": "synthetic_structured_benchmark" if is_synthetic else "real_or_mixed_ocds",
        "synthetic_ratio": round(synthetic_ratio, 4),
        "all_ocids_use_synthetic_prefix": is_synthetic,
        "row_count_total": int(len(combined)),
        "row_count_train": int(len(train_raw)),
        "row_count_test": int(len(test_raw)),
        "date_range_train": {
            "min": _iso(train_raw["tender_datePublished"].min()),
            "max": _iso(train_raw["tender_datePublished"].max()),
        },
        "date_range_test": {
            "min": _iso(test_raw["tender_datePublished"].min()),
            "max": _iso(test_raw["tender_datePublished"].max()),
        },
        "unique_buyers": int(combined.get("buyer_id", pd.Series(dtype="object")).nunique()),
        "unique_suppliers": int(combined.get("supplier_id", pd.Series(dtype="object")).nunique()),
        "procurement_methods": combined.get("tender_procurementMethod", pd.Series(dtype="object")).value_counts().to_dict(),
        "warning": (
            "Current tracked benchmark is synthetic, so metrics should be interpreted as pipeline validation "
            "rather than proof of real-world fraud-detection performance."
            if is_synthetic
            else "Dataset provenance does not appear fully synthetic from OCID prefixes."
        ),
    }


def summarize_feature_health(features: pd.DataFrame) -> dict[str, dict[str, float | bool | int]]:
    """Summarize missingness and degeneracy for each feature column."""
    report: dict[str, dict[str, float | bool | int]] = {}
    for col in features.columns:
        series = features[col]
        non_null = series.dropna()
        nunique = int(non_null.nunique())
        report[col] = {
            "missing_pct": round(float(series.isna().mean() * 100), 2),
            "all_nan": bool(series.isna().all()),
            "constant": bool(len(non_null) > 0 and nunique <= 1),
            "non_null_count": int(non_null.shape[0]),
            "unique_non_null": nunique,
        }
    return report


def summarize_feature_health_overview(
    feature_health: dict[str, dict[str, float | bool | int]],
    *,
    retired_features: Iterable[str] = RETIRED_DEAD_FEATURES,
) -> dict[str, object]:
    """Summarize whether any active features remain degenerate."""
    active_dead = sorted(
        feature
        for feature, stats in feature_health.items()
        if bool(stats["all_nan"]) or bool(stats["constant"])
    )
    retired_features = list(retired_features)
    still_present_retired = sorted(
        feature for feature in retired_features if feature in feature_health
    )
    removed_retired = sorted(
        feature for feature in retired_features if feature not in feature_health
    )
    return {
        "feature_count": len(feature_health),
        "active_dead_feature_count": len(active_dead),
        "active_dead_features": active_dead,
        "retired_dead_features_present": still_present_retired,
        "retired_dead_features_removed": removed_retired,
    }


def resolve_proxy_feature_sets(feature_names: Iterable[str]) -> dict[str, list[str]]:
    """Return feature subsets for circularity ablations."""
    feature_names = list(feature_names)
    return {
        "full": feature_names,
        "proxy_core_removed": [name for name in feature_names if name not in PROXY_CORE_FEATURES],
        "proxy_broad_removed": [name for name in feature_names if name not in PROXY_BROAD_FEATURES],
    }


def _load_best_params() -> tuple[dict, int]:
    params = json.loads(BEST_PARAMS_PATH.read_text())
    n_rounds = int(params.pop("n_rounds", 449))
    return params, n_rounds


def evaluate_feature_subset(
    train_X: pd.DataFrame,
    train_y: pd.Series,
    test_X: pd.DataFrame,
    test_y: pd.Series,
    feature_names: list[str],
    *,
    seed: int = 42,
) -> dict:
    """Train and evaluate a feature subset with the current best params."""
    params, n_rounds = _load_best_params()
    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        tree_method="hist",
        seed=seed,
        n_estimators=n_rounds,
        n_jobs=-1,
        **params,
    )
    weights = compute_sample_weights(train_y)
    model.fit(train_X[feature_names], train_y, sample_weight=weights)
    probs = model.predict_proba(test_X[feature_names])
    preds = probs.argmax(axis=1)

    return {
        "feature_count": len(feature_names),
        "accuracy": round(float(accuracy_score(test_y, preds)), 4),
        "macro_f1": round(float(f1_score(test_y, preds, average="macro")), 4),
        "weighted_f1": round(float(f1_score(test_y, preds, average="weighted")), 4),
        "log_loss": round(float(log_loss(test_y, probs, labels=[0, 1, 2])), 4),
    }


def run_circularity_ablation(
    train_X: pd.DataFrame,
    train_y: pd.Series,
    test_X: pd.DataFrame,
    test_y: pd.Series,
) -> dict:
    """Measure how much performance depends on direct heuristic-label proxies."""
    feature_sets = resolve_proxy_feature_sets(train_X.columns)
    results = {
        name: evaluate_feature_subset(train_X, train_y, test_X, test_y, cols)
        for name, cols in feature_sets.items()
    }
    baseline = results["full"]
    for name in ["proxy_core_removed", "proxy_broad_removed"]:
        results[name]["macro_f1_drop_vs_full"] = round(
            baseline["macro_f1"] - results[name]["macro_f1"], 4
        )
        results[name]["dropped_features"] = [
            feature for feature in train_X.columns if feature not in feature_sets[name]
        ]
    results["interpretation"] = (
        "Large performance drops after removing direct heuristic proxies indicate the current benchmark acts more as "
        "an interpretable risk-rule accelerator than a validated real-world anomaly detector."
    )
    return results


def load_reviewed_labels(
    path: Path = REVIEW_BENCHMARK_PATH,
) -> pd.DataFrame:
    """Load reviewed benchmark rows with valid reviewed labels (0/1/2)."""
    if not path.exists():
        return pd.DataFrame()

    df = pd.read_csv(path)
    if "reviewed_label" not in df.columns:
        return pd.DataFrame()

    reviewed = df.copy()
    reviewed["reviewed_label"] = pd.to_numeric(
        reviewed["reviewed_label"], errors="coerce"
    )
    reviewed = reviewed[reviewed["reviewed_label"].isin([0, 1, 2])].copy()
    if "source_row_idx" in reviewed.columns:
        reviewed["source_row_idx"] = pd.to_numeric(
            reviewed["source_row_idx"], errors="coerce"
        )
        reviewed = reviewed[reviewed["source_row_idx"].notna()].copy()
        reviewed["source_row_idx"] = reviewed["source_row_idx"].astype(int)
    reviewed["reviewed_label"] = reviewed["reviewed_label"].astype(int)
    return reviewed


def load_row_level_reviewed_benchmark(
    path: Path = ROW_LEVEL_REVIEWED_BENCHMARK_PATH,
) -> pd.DataFrame:
    """Load a standardized row-level reviewed benchmark when available."""
    if not path.exists():
        return pd.DataFrame()

    df = pd.read_csv(path)
    required = {"source_row_idx", "reviewed_label"}
    if not required.issubset(df.columns):
        return pd.DataFrame()

    reviewed = df.copy()
    reviewed["source_row_idx"] = pd.to_numeric(reviewed["source_row_idx"], errors="coerce")
    reviewed["reviewed_label"] = pd.to_numeric(reviewed["reviewed_label"], errors="coerce")
    reviewed = reviewed[
        reviewed["source_row_idx"].notna()
        & reviewed["reviewed_label"].isin([0, 1, 2])
    ].copy()
    reviewed["source_row_idx"] = reviewed["source_row_idx"].astype(int)
    reviewed["reviewed_label"] = reviewed["reviewed_label"].astype(int)
    return reviewed


def select_reviewed_rows(
    reviewed: pd.DataFrame,
    raw_df: pd.DataFrame,
    feature_df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
    """Resolve reviewed rows back to raw/features using source_row_idx or OCID."""
    if reviewed.empty:
        return raw_df.iloc[0:0].copy(), feature_df.iloc[0:0].copy(), pd.Series(dtype=int)

    if "source_row_idx" in reviewed.columns and reviewed["source_row_idx"].notna().all():
        idx = reviewed["source_row_idx"].astype(int).to_numpy()
        idx = idx[(idx >= 0) & (idx < len(raw_df))]
        raw_subset = raw_df.iloc[idx].reset_index(drop=True)
        feature_subset = feature_df.iloc[idx].reset_index(drop=True)
        labels = reviewed.iloc[: len(idx)]["reviewed_label"].reset_index(drop=True)
        return raw_subset, feature_subset, labels

    if "ocid" in reviewed.columns and "ocid" in raw_df.columns:
        aligned = raw_df.reset_index(drop=True).reset_index().merge(
            reviewed,
            on="ocid",
            how="inner",
        )
        idx = aligned["index"].astype(int).to_numpy()
        raw_subset = raw_df.iloc[idx].reset_index(drop=True)
        feature_subset = feature_df.iloc[idx].reset_index(drop=True)
        labels = aligned["reviewed_label"].astype(int).reset_index(drop=True)
        return raw_subset, feature_subset, labels

    return raw_df.iloc[0:0].copy(), feature_df.iloc[0:0].copy(), pd.Series(dtype=int)


def compute_operational_review_metrics(
    probs: np.ndarray,
    y_true: pd.Series | np.ndarray,
    *,
    budgets: Iterable[int] = (50, 100, 250, 500, 1000),
    positive_class: int = 2,
) -> dict[str, object]:
    """Compute review-budget metrics using the positive-class score for ranking."""
    y_true_array = pd.Series(y_true).astype(int).to_numpy()
    if probs.ndim != 2:
        raise ValueError("Expected probability matrix with shape (n_samples, n_classes)")

    scores = np.asarray(probs[:, positive_class], dtype=float)
    order = np.argsort(scores)[::-1]
    positives = y_true_array == positive_class
    total_positives = int(positives.sum())
    prevalence = float(total_positives / len(y_true_array)) if len(y_true_array) else 0.0

    metrics: dict[str, object] = {
        "positive_class": CLASS_NAMES.get(positive_class, str(positive_class)),
        "positive_prevalence": round(prevalence, 6),
        "total_samples": int(len(y_true_array)),
        "total_positive": total_positives,
        "budgets": {},
    }

    for budget in budgets:
        k = min(int(budget), len(order))
        if k <= 0:
            continue
        top_idx = order[:k]
        hits = int(positives[top_idx].sum())
        precision = hits / k
        recall = hits / total_positives if total_positives else 0.0
        lift = (precision / prevalence) if prevalence > 0 else None
        metrics["budgets"][str(int(budget))] = {
            "review_count": k,
            "captured_positive": hits,
            "precision_at_k": round(float(precision), 4),
            "recall_at_k": round(float(recall), 4),
            "lift_vs_base_rate": round(float(lift), 4) if lift is not None else None,
            "score_threshold_min": round(float(scores[top_idx].min()), 6),
        }

    return metrics


def summarize_explanation_validation(review_df: pd.DataFrame) -> dict[str, object]:
    """Summarize human explanation-review fields when available."""
    if review_df.empty:
        return {
            "status": "pending_human_review",
            "reviewed_rows": 0,
            "message": "No reviewed explanation rows available yet.",
        }

    result: dict[str, object] = {
        "status": "pending_human_review",
        "reviewed_rows": int(len(review_df)),
    }

    if "explanation_agrees" in review_df.columns:
        agrees = (
            review_df["explanation_agrees"]
            .astype(str)
            .str.strip()
            .str.lower()
            .map({"yes": 1, "true": 1, "1": 1, "no": 0, "false": 0, "0": 0})
        )
        valid = agrees.dropna()
        if len(valid) > 0:
            result["status"] = "available"
            result["agreement_rate"] = round(float(valid.mean()), 4)
            result["agreement_count"] = int(valid.sum())
            result["agreement_total"] = int(len(valid))

    if "explanation_actionable" in review_df.columns:
        actionable = (
            review_df["explanation_actionable"]
            .astype(str)
            .str.strip()
            .str.lower()
            .map({"yes": 1, "true": 1, "1": 1, "no": 0, "false": 0, "0": 0})
        )
        valid = actionable.dropna()
        if len(valid) > 0:
            result["status"] = "available"
            result["actionable_rate"] = round(float(valid.mean()), 4)

    if "explanation_clarity" in review_df.columns:
        clarity = pd.to_numeric(review_df["explanation_clarity"], errors="coerce").dropna()
        if len(clarity) > 0:
            result["status"] = "available"
            result["clarity_mean"] = round(float(clarity.mean()), 4)
            result["clarity_count"] = int(len(clarity))

    if result["status"] == "pending_human_review":
        result["message"] = "Review sheet exists but explanation-review columns are not filled yet."

    return result


def load_manual_review_summary(
    path: Path = MANUAL_REVIEW_SUMMARY_PATH,
) -> pd.DataFrame:
    """Load the imported manual review summary CSV if available."""
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def _summary_lookup(
    summary_df: pd.DataFrame,
    section: str,
    dimension: str,
    metric: str,
    *,
    field: str = "value",
    default: float | str | None = None,
):
    mask = (
        (summary_df["section"] == section)
        & (summary_df["dimension"] == dimension)
        & (summary_df["metric"] == metric)
    )
    if not mask.any():
        return default
    value = summary_df.loc[mask, field].iloc[0]
    return value if pd.notna(value) else default


def _manual_review_confusion_true_rows(summary_df: pd.DataFrame) -> list[list[int]]:
    """Build a true-row/pred-col confusion matrix from the summary CSV."""
    predicted_reviewed = np.zeros((3, 3), dtype=int)
    for pred in range(3):
        for reviewed in range(3):
            value = _summary_lookup(
                summary_df,
                "3. Confusion Matrix",
                f"predicted_{pred}_reviewed_{reviewed}",
                "count",
                default=0,
            )
            predicted_reviewed[pred, reviewed] = int(float(value or 0))
    return predicted_reviewed.T.tolist()


def build_reviewed_subset_metrics_from_summary(
    summary_df: pd.DataFrame,
) -> dict[str, object]:
    """Build reviewed-benchmark metrics from the imported summary CSV."""
    if summary_df.empty:
        return {
            "status": "missing_manual_review_summary",
            "message": "manual_review_summary.csv not found.",
        }

    cm = np.array(_manual_review_confusion_true_rows(summary_df), dtype=int)
    y_true: list[int] = []
    y_pred: list[int] = []
    for true_label in range(3):
        for pred_label in range(3):
            count = int(cm[true_label, pred_label])
            y_true.extend([true_label] * count)
            y_pred.extend([pred_label] * count)

    supports = cm.sum(axis=1)
    per_class_precision = []
    per_class_recall = []
    per_class_f1 = []
    for cls in range(3):
        tp = cm[cls, cls]
        fp = cm[:, cls].sum() - tp
        fn = cm[cls, :].sum() - tp
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per_class_precision.append(precision)
        per_class_recall.append(recall)
        per_class_f1.append(f1)

    accuracy = float(np.mean(np.array(y_true) == np.array(y_pred))) if y_true else 0.0
    macro_f1 = float(np.mean(per_class_f1)) if per_class_f1 else 0.0
    weighted_f1 = float(np.average(per_class_f1, weights=supports)) if supports.sum() else 0.0

    return {
        "status": "available",
        "partition": "reviewed_subset_summary",
        "label_type": "manual_review_summary_labels",
        "reviewed_rows": int(len(y_true)),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class_precision": {
            CLASS_NAMES[i]: round(float(v), 4) for i, v in enumerate(per_class_precision)
        },
        "per_class_recall": {
            CLASS_NAMES[i]: round(float(v), 4) for i, v in enumerate(per_class_recall)
        },
        "per_class_f1": {
            CLASS_NAMES[i]: round(float(v), 4) for i, v in enumerate(per_class_f1)
        },
        "confusion_matrix": cm.tolist(),
        "reviewed_distribution": {
            CLASS_NAMES[0]: int(cm[0, :].sum()),
            CLASS_NAMES[1]: int(cm[1, :].sum()),
            CLASS_NAMES[2]: int(cm[2, :].sum()),
        },
        "predicted_distribution": {
            CLASS_NAMES[0]: int(cm[:, 0].sum()),
            CLASS_NAMES[1]: int(cm[:, 1].sum()),
            CLASS_NAMES[2]: int(cm[:, 2].sum()),
        },
        "overall_agreement": round(
            float(
                _summary_lookup(
                    summary_df,
                    "2. Agreement",
                    "overall",
                    "agree_count",
                    field="pct",
                    default="0%",
                ).strip("%")
            )
            / 100,
            4,
        ),
        "source": "manual_review_summary_csv",
    }


def build_explanation_validation_from_summary(
    summary_df: pd.DataFrame,
) -> dict[str, object]:
    """Build explanation-validation metrics from the imported summary CSV."""
    if summary_df.empty:
        return {
            "status": "missing_manual_review_summary",
            "message": "manual_review_summary.csv not found.",
        }

    yes_count = float(
        _summary_lookup(
            summary_df,
            "6. Explanation Quality",
            "explanation_agrees",
            "yes",
            default=0,
        )
        or 0
    )
    partial_count = float(
        _summary_lookup(
            summary_df,
            "6. Explanation Quality",
            "explanation_agrees",
            "partial",
            default=0,
        )
        or 0
    )
    no_count = float(
        _summary_lookup(
            summary_df,
            "6. Explanation Quality",
            "explanation_agrees",
            "no",
            default=0,
        )
        or 0
    )
    reviewed_rows = int(yes_count + partial_count + no_count)

    group_rows = summary_df[summary_df["section"] == "5. By Sampling Group"]
    by_group: dict[str, dict[str, float | int]] = {}
    for group_name in group_rows["dimension"].dropna().unique():
        group_metrics = group_rows[group_rows["dimension"] == group_name]
        entry: dict[str, float | int] = {}
        for _, row in group_metrics.iterrows():
            value = row["value"]
            try:
                parsed: float | int = float(value)
                if parsed.is_integer():
                    parsed = int(parsed)
            except Exception:
                continue
            entry[str(row["metric"])] = parsed
        by_group[str(group_name)] = entry

    top_factor_rows = summary_df[summary_df["section"] == "7. Top Factors"]
    top_factors = [
        {
            "feature": str(row["dimension"]),
            "count": int(float(row["value"])),
            "share_pct": str(row["pct"]),
            "notes": str(row["notes"]),
        }
        for _, row in top_factor_rows.iterrows()
    ]

    return {
        "status": "available",
        "reviewed_rows": reviewed_rows,
        "agreement_yes_rate": round(yes_count / reviewed_rows, 4) if reviewed_rows else 0.0,
        "agreement_partial_rate": round(partial_count / reviewed_rows, 4) if reviewed_rows else 0.0,
        "agreement_no_rate": round(no_count / reviewed_rows, 4) if reviewed_rows else 0.0,
        "clarity_mean": round(
            float(
                _summary_lookup(
                    summary_df,
                    "6. Explanation Quality",
                    "explanation_clarity",
                    "mean",
                    default=0,
                )
                or 0
            ),
            4,
        ),
        "clarity_median": round(
            float(
                _summary_lookup(
                    summary_df,
                    "6. Explanation Quality",
                    "explanation_clarity",
                    "median",
                    default=0,
                )
                or 0
            ),
            4,
        ),
        "actionable_mean": round(
            float(
                _summary_lookup(
                    summary_df,
                    "6. Explanation Quality",
                    "explanation_actionable",
                    "mean",
                    default=0,
                )
                or 0
            ),
            4,
        ),
        "actionable_median": round(
            float(
                _summary_lookup(
                    summary_df,
                    "6. Explanation Quality",
                    "explanation_actionable",
                    "median",
                    default=0,
                )
                or 0
            ),
            4,
        ),
        "by_sampling_group": by_group,
        "top_factors": top_factors,
        "source": "manual_review_summary_csv",
    }

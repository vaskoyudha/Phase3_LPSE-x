"""SHAP and counterfactual explanation utilities.

Owns the XAI stack:
  - Global SHAP summary (TreeExplainer on native .ubj model)
  - Local single-record explanations via explain_single()
  - SHAP-based counterfactual suggestions (Task 21 fallback)

Contract:
  - explain_single() returns: predicted_class, probability, factors
  - factors is a list of dicts: [{feature, value, shap_value, direction}, ...]
  - Multi-class handling indexes SHAP values by predicted class
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import numpy as np
import pandas as pd
import xgboost as xgb

from src import RANDOM_SEED
from src.data import PROJECT_ROOT
from src.model import (
    MODELS_DIR,
    N_CLASSES,
    CLASS_NAMES,
    load_model,
    load_train_artifacts,
    load_test_artifacts,
    apply_temperature,
)

logger = logging.getLogger(__name__)

MODEL_PATH = Path("models/xgb_model.ubj")
SHAP_SUMMARY_PATH = Path("proposal/figures/shap_summary.png")
FIGURES_DIR = PROJECT_ROOT / "proposal" / "figures"
LABEL_NAMES: Dict[int, str] = {0: "Rendah", 1: "Sedang", 2: "Tinggi"}


class XGBoostContributionExplainer:
    """SHAP-compatible fallback using native XGBoost feature contributions."""

    def __init__(self, model: xgb.Booster):
        self.model = model

    def shap_values(self, X):
        if isinstance(X, xgb.DMatrix):
            dmatrix = X
        elif isinstance(X, pd.DataFrame):
            dmatrix = xgb.DMatrix(X)
        else:
            arr = np.asarray(X, dtype=np.float32)
            if arr.ndim == 1:
                arr = arr.reshape(1, -1)
            dmatrix = xgb.DMatrix(arr)

        contrib = self.model.predict(dmatrix, pred_contribs=True)
        if isinstance(contrib, np.ndarray) and contrib.ndim == 3:
            return np.transpose(contrib[:, :, :-1], (0, 2, 1))
        if isinstance(contrib, np.ndarray) and contrib.ndim == 2:
            return contrib[:, :-1]
        return contrib

# ---------------------------------------------------------------------------
# Model / explainer loading
# ---------------------------------------------------------------------------
 
 
def load_model(model_path: Path = MODEL_PATH):
    """Load the native XGBoost Booster from its .ubj checkpoint."""
    import xgboost as xgb
 
    if not model_path.exists():
        raise FileNotFoundError(
            f"XGBoost model not found at {model_path}. "
            "Complete Task 13 (training) first."
        )
    model = xgb.Booster()
    model.load_model(str(model_path))
    return model
 
 
def get_explainer(model, model_path: Path = MODEL_PATH):
    """Return a TreeExplainer for the given model."""
    import shap
 
    return shap.TreeExplainer(model)
 
 
# ---------------------------------------------------------------------------
# Core API: explain_single
# ---------------------------------------------------------------------------
 
 
def explain_single(
    row: Union[Dict[str, float], np.ndarray],
    feature_names: List[str],
    model=None,
    explainer=None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Produce a local explanation for a single procurement record.
 
    Parameters
    ----------
    row           : dict {feature_name: value} or 1-D numpy array
    feature_names : ordered list of feature names matching the model's input
    model         : fitted XGBClassifier (loaded from MODEL_PATH if None)
    explainer     : shap.TreeExplainer (created from model if None)
    top_k         : number of top factors to include in output
 
    Returns
    -------
    {
        "predicted_class": int,        # 0 = Rendah, 1 = Sedang, 2 = Tinggi
        "probability":     float,      # probability for predicted_class
        "factors": [
            {
                "feature":       str,
                "shap_value":    float,  # signed; positive = pushes toward class
                "feature_value": float   # actual value of the feature
            },
            ...                         # sorted by |shap_value| descending
        ]
    }
 
    Note: the legacy key "top_factors" is never returned.
    """
    import shap  # noqa: F401 – ensure shap is importable
 
    if model is None:
        model = load_model()
    if explainer is None:
        explainer = get_explainer(model)
 
    # Materialise input as (1, n_features) float32 array
    if isinstance(row, dict):
        X = np.array([[row[f] for f in feature_names]], dtype=np.float32)
    else:
        arr = np.asarray(row, dtype=np.float32)
        X = arr.reshape(1, -1) if arr.ndim == 1 else arr
 
    # ---- Prediction --------------------------------------------------------
    proba = model.predict_proba(X)[0]          # shape (n_classes,)
    predicted_class = int(np.argmax(proba))
    probability = float(proba[predicted_class])
 
    # ---- SHAP values -------------------------------------------------------
    # shap_values may be:
    #   list of (1, n_features) arrays  – one per class (multi-class TreeExplainer)
    #   (1, n_features, n_classes) ndarray
    shap_values = explainer.shap_values(X)
 
    if isinstance(shap_values, list):
        # list[class_idx] → (1, n_features)
        class_shap: np.ndarray = shap_values[predicted_class][0]
    elif isinstance(shap_values, np.ndarray):
        if shap_values.ndim == 3:
            # (1, n_features, n_classes)
            class_shap = shap_values[0, :, predicted_class]
        elif shap_values.ndim == 2:
            # (1, n_features) – binary case or single explanation
            class_shap = shap_values[0]
        else:
            class_shap = shap_values
    else:
        class_shap = np.array(shap_values)
 
    feature_values: np.ndarray = X[0]
 
    # ---- Build factors list ------------------------------------------------
    abs_shap = np.abs(class_shap)
    sorted_indices = np.argsort(abs_shap)[::-1][:top_k]
 
    factors: List[Dict[str, Any]] = [
        {
            "feature": feature_names[i],
            "shap_value": float(class_shap[i]),
            "feature_value": float(feature_values[i]),
        }
        for i in sorted_indices
    ]
 
    return {
        "predicted_class": predicted_class,
        "probability": probability,
        "factors": factors,
    }
 
 
# ---------------------------------------------------------------------------
# Batch explanation
# ---------------------------------------------------------------------------
 
 
def explain_batch(
    X: np.ndarray,
    feature_names: List[str],
    model=None,
    explainer=None,
) -> np.ndarray:
    """
    Return raw SHAP values for a batch.
 
    Shape of output follows shap.TreeExplainer convention:
      list of (n_samples, n_features) – one per class, OR
      (n_samples, n_features, n_classes) ndarray.
    """
    if model is None:
        model = load_model()
    if explainer is None:
        explainer = get_explainer(model)
 
    return explainer.shap_values(X.astype(np.float32))
 
 
# ---------------------------------------------------------------------------
# Global summary plot
# ---------------------------------------------------------------------------
 
 
def plot_shap_summary(
    X: np.ndarray,
    feature_names: List[str],
    model=None,
    explainer=None,
    output_path: Path = SHAP_SUMMARY_PATH,
    max_display: int = 20,
) -> Path:
    """
    Generate the global SHAP bar summary plot and save it to output_path.
 
    Saved figure is used by proposal/bab4.md and inference.ipynb.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import shap
 
    if model is None:
        model = load_model()
    if explainer is None:
        explainer = get_explainer(model)
 
    X_f32 = X.astype(np.float32)
    shap_values = explainer.shap_values(X_f32)
 
    output_path.parent.mkdir(parents=True, exist_ok=True)
 
    plt.figure(figsize=(10, 8))
    shap.summary_plot(
        shap_values,
        X_f32,
        feature_names=feature_names,
        class_names=list(LABEL_NAMES.values()),
        max_display=max_display,
        show=False,
        plot_type="bar",
    )
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
 
    logger.info("SHAP summary plot saved → %s", output_path)
    return output_path
 
 
# ---------------------------------------------------------------------------
# Counterfactual – SHAP-based fallback
# ---------------------------------------------------------------------------
 
 
def get_counterfactual_shap(
    result: Dict[str, Any],
    feature_names: Optional[List[str]] = None,
    top_changes: int = 3,
) -> Dict[str, Any]:
    """
    SHAP-based counterfactual: identify which features to change to lower
    the predicted risk class.
 
    This is the mandatory fallback path.  It is always available, even when
    DiCE times out.
 
    Returns
    -------
    {
        "predicted_class":   int,
        "suggested_changes": [
            {
                "feature":           str,
                "current_value":     float,
                "direction":         "decrease" | "increase",
                "shap_contribution": float
            },
            ...
        ]
    }
    """
    predicted_class = result["predicted_class"]
    factors = result["factors"]
 
    changes: List[Dict[str, Any]] = []
    for factor in factors:
        sv = factor["shap_value"]
        if sv > 0:
            # Feature positively pushes toward (risky) predicted class
            changes.append(
                {
                    "feature": factor["feature"],
                    "current_value": factor["feature_value"],
                    "direction": "decrease",
                    "shap_contribution": float(sv),
                }
            )
        # Negative SHAP already works in our favour; skip
 
    # Sort by largest contribution first, take top_changes
    changes.sort(key=lambda x: x["shap_contribution"], reverse=True)
 
    return {
        "predicted_class": predicted_class,
        "suggested_changes": changes[:top_changes],
    }
 
 
def get_counterfactual_dice(
    row: Union[Dict[str, float], np.ndarray],
    feature_names: List[str],
    train_df,
    model,
    timebox_seconds: float = 30.0,
    fallback_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Timeboxed DiCE counterfactual attempt.
 
    If DiCE is unavailable, times out, or raises any exception,
    the SHAP-based fallback is returned instead.
 
    Parameters
    ----------
    fallback_result : pre-computed explain_single() result to use for fallback.
                      If None, returns a minimal error dict.
    """
    import signal
    import contextlib
 
    @contextlib.contextmanager
    def _timeout(seconds: float):
        def _handler(signum, frame):
            raise TimeoutError(f"DiCE exceeded {seconds}s timebox")
        old = signal.signal(signal.SIGALRM, _handler)
        signal.setitimer(signal.ITIMER_REAL, seconds)
        try:
            yield
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, old)
 
    try:
        with _timeout(timebox_seconds):
            import dice_ml  # type: ignore
 
            # Build DiCE data object
            import pandas as pd
            if isinstance(row, dict):
                row_df = pd.DataFrame([row])
            else:
                row_df = pd.DataFrame([dict(zip(feature_names, row))])
 
            d = dice_ml.Data(
                dataframe=train_df,
                continuous_features=feature_names,
                outcome_name="heuristic_label",
            )
            m = dice_ml.Model(model=model, backend="sklearn")
            exp = dice_ml.Dice(d, m, method="random")
            cf = exp.generate_counterfactuals(row_df, total_CFs=3, desired_class="opposite")
 
            # Extract suggestions from DiCE output
            cf_df = cf.cf_examples_list[0].final_cfs_df
            changes = []
            for col in feature_names:
                orig = float(row_df[col].iloc[0]) if col in row_df.columns else 0.0
                new_val = float(cf_df[col].iloc[0]) if col in cf_df.columns else orig
                if abs(new_val - orig) > 1e-6:
                    changes.append(
                        {
                            "feature": col,
                            "current_value": orig,
                            "suggested_value": new_val,
                            "direction": "decrease" if new_val < orig else "increase",
                            "source": "dice",
                        }
                    )
 
            return {
                "predicted_class": fallback_result["predicted_class"] if fallback_result else None,
                "suggested_changes": changes[:3],
                "source": "dice",
            }
 
    except (ImportError, TimeoutError, Exception) as exc:
        logger.warning(
            "DiCE counterfactual failed (%s); using SHAP fallback.", type(exc).__name__
        )
        if fallback_result is not None:
            result = get_counterfactual_shap(fallback_result)
            result["source"] = "shap_fallback"
            return result
        return {
            "predicted_class": None,
            "suggested_changes": [],
            "source": "shap_fallback",
            "error": str(exc),
        }

# ---------------------------------------------------------------------------
# SHAP explainer
# ---------------------------------------------------------------------------


def get_explainer(model: xgb.Booster | None = None):
    """Create a SHAP TreeExplainer or XGBoost-contrib fallback.

    Uses the native .ubj model (not ONNX) for SHAP compatibility. If SHAP is
    unavailable or binary-incompatible in the current environment, fall back to
    native XGBoost feature contributions so explanation paths remain usable.
    """
    if model is None:
        model = load_model()

    try:
        import shap
        return shap.TreeExplainer(model)
    except Exception as exc:
        logger.warning(
            "SHAP TreeExplainer unavailable (%s: %s); using XGBoost contribution fallback.",
            type(exc).__name__,
            exc,
        )
        return XGBoostContributionExplainer(model)


def compute_shap_values(
    explainer,
    X: pd.DataFrame,
) -> np.ndarray:
    """Compute SHAP values for a feature DataFrame.

    Returns array of shape (n_samples, n_features, n_classes) for multi-class.
    """
    dmatrix = xgb.DMatrix(X)
    shap_values = explainer.shap_values(dmatrix)

    # shap_values is a list of arrays [class_0, class_1, class_2]
    # Each array shape: (n_samples, n_features)
    if isinstance(shap_values, list):
        # Stack into (n_samples, n_features, n_classes)
        shap_array = np.stack(shap_values, axis=-1)
    else:
        shap_array = shap_values

    return shap_array


# ---------------------------------------------------------------------------
# Single-record explanation (canonical API)
# ---------------------------------------------------------------------------


def explain_single(
    row: Union[Dict[str, float], np.ndarray, pd.DataFrame, pd.Series],
    feature_names: Optional[List[str]] = None,
    model=None,
    explainer=None,
    calibration: Optional[dict] = None,
    top_k: int = 5,
) -> dict:
    """Explain a single procurement record.

    Supports both project call patterns:
    - explain_single(row_df_or_series, model=..., explainer=...)
    - explain_single(row_dict_or_array, feature_names, model=..., explainer=...)

    Returns a superset contract so both the legacy tests and the current
    project code can consume the result safely.
    """
    if model is None:
        model = load_model()
    if explainer is None:
        explainer = get_explainer(model)

    if isinstance(row, pd.DataFrame):
        row_df = row.copy()
    elif isinstance(row, pd.Series):
        row_df = row.to_frame().T
    elif isinstance(row, dict):
        inferred_names = feature_names or list(row.keys())
        row_df = pd.DataFrame([[row[name] for name in inferred_names]], columns=inferred_names)
    else:
        arr = np.asarray(row, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        inferred_names = feature_names or [f"feature_{i}" for i in range(arr.shape[1])]
        row_df = pd.DataFrame(arr, columns=inferred_names)

    resolved_feature_names = feature_names or row_df.columns.tolist()
    row_df = row_df.loc[:, resolved_feature_names]
    x_array = row_df.to_numpy(dtype=np.float32, copy=False)

    if hasattr(model, "predict_proba"):
        probs = np.asarray(model.predict_proba(x_array))[0]
        shap_input = x_array
    else:
        dmatrix = xgb.DMatrix(row_df)
        probs = np.asarray(model.predict(dmatrix))[0]
        shap_input = dmatrix

    if calibration and calibration.get("enabled"):
        probs = apply_temperature(
            np.asarray(probs, dtype=np.float32).reshape(1, -1),
            calibration["temperature"],
        )[0]

    predicted_class = int(np.argmax(probs))
    probability = float(probs[predicted_class])

    try:
        shap_values = explainer.shap_values(shap_input)
    except Exception:
        shap_values = explainer.shap_values(x_array)

    if isinstance(shap_values, list):
        class_shap = np.asarray(shap_values[predicted_class])[0]
    elif isinstance(shap_values, np.ndarray) and shap_values.ndim == 3:
        class_shap = shap_values[0, :, predicted_class]
    elif isinstance(shap_values, np.ndarray) and shap_values.ndim == 2:
        class_shap = shap_values[0]
    else:
        class_shap = np.asarray(shap_values).reshape(-1)

    feature_values = row_df.iloc[0].to_numpy()
    factors = [
        {
            "feature": name,
            "value": float(val) if not pd.isna(val) else None,
            "feature_value": float(val) if not pd.isna(val) else None,
            "shap_value": float(sv),
            "direction": "increases_risk" if sv > 0 else "decreases_risk",
        }
        for name, val, sv in zip(resolved_feature_names, feature_values, class_shap)
    ]
    factors.sort(key=lambda item: abs(item["shap_value"]), reverse=True)
    factors = factors[:top_k]

    predicted_label = CLASS_NAMES.get(predicted_class, str(predicted_class))
    return {
        "predicted_class": predicted_class,
        "predicted_label": predicted_label,
        "probability": float(round(probability, 6)),
        "probabilities": [float(round(float(p), 6)) for p in probs],
        "factors": factors,
    }


# ---------------------------------------------------------------------------
# Global SHAP summary figure
# ---------------------------------------------------------------------------


def generate_shap_summary(
    model: xgb.Booster | None = None,
    X: pd.DataFrame | None = None,
    max_samples: int = 500,
) -> Path:
    """Generate the global SHAP summary plot.

    Uses a sample of test data for computational efficiency.
    Saves to proposal/figures/shap_summary.png.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    if model is None:
        model = load_model()

    if X is None:
        X, _ = load_test_artifacts()

    # Sample for speed
    if len(X) > max_samples:
        X_sample = X.sample(n=max_samples, random_state=RANDOM_SEED)
    else:
        X_sample = X

    explainer = get_explainer(model)
    dmatrix = xgb.DMatrix(X_sample)
    shap_values = explainer.shap_values(dmatrix)

    FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    # shap_values can be list of arrays OR ndarray (n_samples, n_features, n_classes)
    # Get high-risk class (class 2) shap values
    if isinstance(shap_values, list):
        sv_high = shap_values[2]  # (n_samples, n_features)
    elif isinstance(shap_values, np.ndarray) and shap_values.ndim == 3:
        sv_high = shap_values[:, :, 2]  # (n_samples, n_features)
    else:
        sv_high = shap_values

    # Custom bar plot using mean |SHAP| — more reliable across SHAP versions
    mean_abs = np.abs(sv_high).mean(axis=0)
    feature_importance = pd.Series(mean_abs, index=X_sample.columns)
    feature_importance = feature_importance.sort_values(ascending=True).tail(15)

    fig, ax = plt.subplots(figsize=(10, 8))
    colors = plt.cm.Reds(np.linspace(0.3, 0.9, len(feature_importance)))
    feature_importance.plot.barh(ax=ax, color=colors, edgecolor="black", linewidth=0.5)
    ax.set_xlabel("Mean |SHAP Value|", fontsize=12, fontweight="bold")
    ax.set_title("SHAP Feature Importance — High Risk Class", fontsize=14, fontweight="bold")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    out_path = FIGURES_DIR / "shap_summary.png"
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    logger.info("SHAP summary plot saved to %s", out_path)
    return out_path


# ---------------------------------------------------------------------------
# SHAP-based counterfactual suggestions (Task 21 fallback)
# ---------------------------------------------------------------------------


def shap_counterfactual(
    explanation: dict,
    target_class: int = 0,
) -> list[dict]:
    """Generate counterfactual suggestions based on SHAP values.

    For a high-risk prediction, suggests which features would need to
    change to reduce risk. This is the SHAP-based fallback for Task 21
    (used when DiCE is unavailable or times out).

    Args:
        explanation: Output from explain_single()
        target_class: Desired class (0 = Low Risk)

    Returns:
        List of suggestions, each with:
            - feature, current_value, suggestion, impact
    """
    if explanation["predicted_class"] == target_class:
        return [{"message": "Already classified as target class"}]

    suggestions = []
    for factor in explanation["factors"]:
        if factor["direction"] == "increases_risk" and factor["shap_value"] > 0:
            suggestion = {
                "feature": factor["feature"],
                "current_value": factor["value"],
                "suggestion": _generate_suggestion(factor["feature"], factor["value"]),
                "impact": round(abs(factor["shap_value"]), 4),
            }
            suggestions.append(suggestion)

    return suggestions


def _generate_suggestion(feature: str, value) -> str:
    """Generate a human-readable suggestion for a feature."""
    suggestions_map = {
        "f_single_bidder": "Ensure multiple bidders participate in the tender",
        "f_num_tenderers": "Increase the number of tenderers (currently low)",
        "f_price_deviation_ratio": "Review award-to-tender price ratio for anomalies",
        "f_procurement_method_enc": "Consider using open procurement method",
        "f_is_q4": "Review Q4 procurement timing for budget-spending patterns",
        "f_title_length": "Provide more detailed tender title",
        "f_description_length": "Provide comprehensive tender description",
        "f_tender_value_log": "Review tender value against market benchmarks",
        "f_award_value_log": "Review award value against tender value",
    }
    return suggestions_map.get(feature, f"Review {feature} (current value: {value})")

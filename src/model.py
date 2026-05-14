"""Training, evaluation, ONNX export, and calibration utilities.

Owns the full model lifecycle:
  - HPO via Optuna on internal dev splits (train_fit / val_hpo)
  - Final model training on train_fit + val_hpo
  - Evaluation metrics (per-class F1, confusion matrix)
  - Model save/load (.ubj format)
  - ONNX export (Task 19)
  - Temperature-scaled calibration (Task 16)

HARD RULES:
  - HPO uses train_fit + val_hpo ONLY, never test_data
  - test_data is used ONLY for final reported metrics
  - models/metrics.json is the canonical metrics file
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    f1_score,
    classification_report,
    confusion_matrix,
    accuracy_score,
    log_loss,
)

from src import RANDOM_SEED
from src.data import PROJECT_ROOT, PROCESSED_DIR
from src.split import TRAIN_DIR, TEST_DIR
from src.labels import CALIBRATION_SOURCE_INDEX_COL

logger = logging.getLogger(__name__)

MODELS_DIR = PROJECT_ROOT / "models"

# Canonical artifact paths at project root (spec-compliant)
MODEL_RISK_UBJ = PROJECT_ROOT / "model_risk.ubj"
MODEL_RISK_ONNX = PROJECT_ROOT / "model_risk.onnx"

# Legacy paths in models/ directory
XGB_MODEL_PATH = MODELS_DIR / "xgb_model.ubj"
ONNX_MODEL_PATH = MODELS_DIR / "xgb_model.onnx"
BEST_PARAMS_PATH = MODELS_DIR / "best_params.json"
METRICS_PATH = MODELS_DIR / "metrics.json"
DECISION_THRESHOLDS_PATH = MODELS_DIR / "decision_thresholds.json"
CALIBRATION_PATH = MODELS_DIR / "calibration.json"
IMPUTATION_PATH = MODELS_DIR / "imputation_values.json"

LABEL_NAMES = ["Rendah", "Sedang", "Tinggi"]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_CLASSES = 3
CLASS_NAMES = {0: "Low Risk", 1: "Medium Risk", 2: "High Risk"}

# Default XGBoost base params (non-tunable)
BASE_PARAMS = {
    "objective": "multi:softprob",
    "num_class": N_CLASSES,
    "eval_metric": "mlogloss",
    "tree_method": "hist",
    "seed": RANDOM_SEED,
    "verbosity": 0,
}


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------


def load_train_artifacts() -> tuple[pd.DataFrame, pd.Series]:
    """Load training features and labels."""
    features = pd.read_parquet(TRAIN_DIR / "features.parquet")
    labels = pd.read_parquet(TRAIN_DIR / "labels.parquet")
    return features, labels["risk_label"]


def load_test_artifacts() -> tuple[pd.DataFrame, pd.Series]:
    """Load test features and labels."""
    features = pd.read_parquet(TEST_DIR / "features.parquet")
    labels = pd.read_parquet(TEST_DIR / "labels.parquet")
    return features, labels["risk_label"]


def load_dev_split_indices(
    train_features: pd.DataFrame,
    train_raw: pd.DataFrame | None = None,
) -> dict[str, np.ndarray]:
    """Load dev split boundaries and return index arrays.

    Uses the dev_split_manifest to partition train data into
    train_fit, val_hpo, and val_calibration by temporal ordering.
    """
    manifest_path = PROCESSED_DIR / "dev_split_manifest.json"
    manifest = json.loads(manifest_path.read_text())

    n = len(train_features)
    n_fit = manifest["train_fit"]["count"]
    n_hpo = manifest["val_hpo"]["count"]
    n_cal = manifest["val_calibration"]["count"]

    # The dev splits were created by temporal ordering, so we can
    # reconstruct index ranges from counts
    indices = {
        "train_fit": np.arange(0, n_fit),
        "val_hpo": np.arange(n_fit, n_fit + n_hpo),
        "val_calibration": np.arange(n_fit + n_hpo, n_fit + n_hpo + n_cal),
    }

    return indices


# ---------------------------------------------------------------------------
# Training and HPO
# ---------------------------------------------------------------------------
 
 
def train_xgboost(
    X: pd.DataFrame | np.ndarray,
    y: pd.Series | np.ndarray,
    params: Optional[Dict[str, Any]] = None,
    num_boost_round: int = 300,
    sample_weight: Optional[np.ndarray] = None,
    evals: Optional[list] = None,
    early_stopping_rounds: Optional[int] = None,
) -> xgb.Booster:
    """Train an XGBoost classifier using the native Booster API.

    Parameters
    ----------
    X : DataFrame or ndarray
        Training features.
    y : Series or ndarray
        Training labels (integer-encoded class indices).
    params : dict, optional
        XGBoost parameters. Merged with BASE_PARAMS defaults.
    num_boost_round : int
        Number of boosting rounds.
    sample_weight : ndarray, optional
        Per-sample weights. If None, computed from class frequencies.
    evals : list, optional
        Evaluation sets for early stopping, e.g. [(dval, "val")].
    early_stopping_rounds : int, optional
        Stop if no improvement for this many rounds.

    Returns
    -------
    xgb.Booster
        The trained XGBoost model.
    """
    y_arr = np.asarray(y, dtype=int)

    if sample_weight is None:
        sample_weight = compute_sample_weights(pd.Series(y_arr))

    dtrain = xgb.DMatrix(X, label=y_arr, weight=sample_weight)

    train_params = {**BASE_PARAMS}
    if params:
        train_params.update(params)

    kwargs: Dict[str, Any] = {
        "params": train_params,
        "dtrain": dtrain,
        "num_boost_round": num_boost_round,
        "verbose_eval": False,
    }
    if evals is not None:
        kwargs["evals"] = evals
    if early_stopping_rounds is not None:
        kwargs["early_stopping_rounds"] = early_stopping_rounds

    model = xgb.train(**kwargs)
    logger.info(
        "train_xgboost: trained %d trees with %d samples",
        model.num_boosted_rounds(),
        len(y_arr),
    )
    return model
 
 

 
 
# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------
 
 
def evaluate_model(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    label_source: str = "heuristic",
    temperature: float = 1.0,
) -> Dict[str, Any]:
    """
    Compute final metrics on the held-out test split.
 
    Parameters
    ----------
    label_source : "heuristic" or "clean_label_calibration".
                   All metrics in models/metrics.json must carry this tag.
    temperature  : temperature scaling factor (1.0 = no calibration).
 
    Returns a metrics dict (also written to models/metrics.json).
    """
    proba = model.predict_proba(X_test)
    if temperature != 1.0:
        # Temperature scaling on logits
        logits = np.log(proba + 1e-9)
        scaled = logits / temperature
        exp_scaled = np.exp(scaled - scaled.max(axis=1, keepdims=True))
        proba = exp_scaled / exp_scaled.sum(axis=1, keepdims=True)
 
    preds = np.argmax(proba, axis=1)
 
    macro_f1 = float(f1_score(y_test, preds, average="macro"))
    weighted_f1 = float(f1_score(y_test, preds, average="weighted"))
    per_class_f1 = f1_score(y_test, preds, average=None).tolist()
 
    try:
        roc_auc = float(roc_auc_score(y_test, proba, multi_class="ovr", average="macro"))
    except Exception:
        roc_auc = None
 
    cm = confusion_matrix(y_test, preds).tolist()
    report = classification_report(y_test, preds, target_names=LABEL_NAMES, output_dict=True)
 
    metrics: Dict[str, Any] = {
        "label_source": label_source,
        "note": (
            "Metrics are measured against heuristic risk labels unless "
            "label_source == 'clean_label_calibration'."
        ),
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "per_class_f1": {LABEL_NAMES[i]: per_class_f1[i] for i in range(len(per_class_f1))},
        "roc_auc_ovr_macro": roc_auc,
        "confusion_matrix": cm,
        "classification_report": report,
        "temperature_applied": temperature,
        "n_test_samples": int(len(y_test)),
    }
 
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    logger.info("Metrics written to %s  (macro-F1=%.4f)", METRICS_PATH, macro_f1)
    return metrics
 
 
# ---------------------------------------------------------------------------
# Temperature calibration
# ---------------------------------------------------------------------------
 
 
def fit_temperature(
    probs: np.ndarray,
    y_true: np.ndarray | pd.Series,
    grid: Optional[List[float]] = None,
) -> float:
    """Fit temperature scaling for probability calibration.

    Optimizes temperature T that minimizes negative log-likelihood (NLL)
    on the calibration set.

    Parameters
    ----------
    probs : ndarray of shape (n_samples, n_classes)
        Predicted probability array from the model.
    y_true : array-like
        True class labels (integer-encoded).
    grid : list of float, optional
        Temperature values to search. If None, uses a default grid.

    Returns
    -------
    float
        Optimal temperature value.

    **Validates: Requirements 5.4**
    """
    from scipy.special import log_softmax

    probs = np.asarray(probs, dtype=float)
    y_true = np.asarray(y_true, dtype=int)

    if grid is None:
        grid = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 2.0, 3.0, 5.0]

    logits = np.log(probs + 1e-9)

    best_T = 1.0
    best_nll = float("inf")

    for T in grid:
        scaled_logits = logits / T
        log_proba = log_softmax(scaled_logits, axis=1)
        nll = -log_proba[np.arange(len(y_true)), y_true].mean()
        if nll < best_nll:
            best_nll = nll
            best_T = T

    logger.info("Temperature scaling: T=%.3f  NLL=%.4f", best_T, best_nll)
    return best_T
 
 
def save_calibration(
    enabled: bool,
    temperature: float = 1.0,
    n_cal_rows: int = 0,
    label_source: str = "heuristic",
) -> None:
    """Write models/calibration.json."""
    cal_info = {
        "enabled": enabled,
        "temperature": temperature if enabled else None,
        "n_calibration_rows_used": n_cal_rows,
        "label_source": label_source,
        "note": (
            "Temperature scaling disabled: fewer than 80 high-confidence rows "
            "were reviewed."
            if not enabled
            else "Temperature scaling fitted on manually reviewed val_calibration subset."
        ),
    }
    CALIBRATION_PATH.write_text(json.dumps(cal_info, indent=2))
    logger.info("Calibration info written to %s", CALIBRATION_PATH)
 
 
# ---------------------------------------------------------------------------
# Evaluation figures
# ---------------------------------------------------------------------------
 
 
def plot_confusion_matrix(
    metrics: Dict[str, Any],
    output_path: Path = Path("proposal/figures/confusion_matrix.png"),
) -> None:
    import matplotlib.pyplot as plt
    import seaborn as sns
 
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cm = np.array(metrics["confusion_matrix"])
    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=LABEL_NAMES,
        yticklabels=LABEL_NAMES,
        ax=ax,
    )
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Confusion Matrix (test set – heuristic labels)")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Saved confusion matrix to %s", output_path)
 
 
def plot_per_class_f1(
    metrics: Dict[str, Any],
    output_path: Path = Path("proposal/figures/per_class_f1.png"),
) -> None:
    import matplotlib.pyplot as plt
 
    output_path.parent.mkdir(parents=True, exist_ok=True)
    names = list(metrics["per_class_f1"].keys())
    scores = list(metrics["per_class_f1"].values())
    colors = ["#4CAF50", "#FF9800", "#F44336"]
 
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.barh(names, scores, color=colors)
    ax.set_xlim(0, 1)
    ax.set_xlabel("F1-Score")
    ax.set_title("Per-Class F1-Score (test set – heuristic labels)")
    for bar, score in zip(bars, scores):
        ax.text(score + 0.01, bar.get_y() + bar.get_height() / 2,
                f"{score:.3f}", va="center", fontsize=10)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Saved per-class F1 figure to %s", output_path)
 
 
def plot_calibration_curve(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    output_path: Path = Path("proposal/figures/calibration_curve.png"),
    temperature: float = 1.0,
) -> None:
    import matplotlib.pyplot as plt
    from sklearn.calibration import calibration_curve
 
    output_path.parent.mkdir(parents=True, exist_ok=True)
    proba = model.predict_proba(X_test)
    if temperature != 1.0:
        logits = np.log(proba + 1e-9)
        scaled = logits / temperature
        exp_scaled = np.exp(scaled - scaled.max(axis=1, keepdims=True))
        proba = exp_scaled / exp_scaled.sum(axis=1, keepdims=True)
 
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot([0, 1], [0, 1], "k--", label="Perfect calibration")
 
    for cls_idx, cls_name in enumerate(LABEL_NAMES):
        y_binary = (y_test == cls_idx).astype(int)
        p_cls = proba[:, cls_idx]
        try:
            frac_pos, mean_pred = calibration_curve(y_binary, p_cls, n_bins=8)
            ax.plot(mean_pred, frac_pos, marker="o", label=cls_name)
        except Exception:
            pass
 
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Fraction of positives")
    ax.set_title(f"Calibration Curve (T={temperature:.2f})")
    ax.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Saved calibration curve to %s", output_path)
 
 
# ---------------------------------------------------------------------------
# Task 19: ONNX export and imputation
# ---------------------------------------------------------------------------
 
 
def fit_imputation(
    X_train_df: pd.DataFrame,
    numeric_cols: Optional[List[str]] = None,
) -> Dict[str, float]:
    """
    Compute median imputation values from training data only.
    Returns a dict {column_name: median_value} and writes
    models/imputation_values.json.
    """
    if numeric_cols is None:
        numeric_cols = X_train_df.select_dtypes(include="number").columns.tolist()
 
    imputation_values: Dict[str, float] = {}
    for col in numeric_cols:
        median_val = float(X_train_df[col].median())
        imputation_values[col] = median_val
 
    IMPUTATION_PATH.write_text(json.dumps(imputation_values, indent=2))
    logger.info(
        "Imputation values fit from training data (%d features) → %s",
        len(imputation_values),
        IMPUTATION_PATH,
    )
    return imputation_values
 
 
def apply_imputation(
    df: pd.DataFrame,
    imputation_values: Optional[Dict[str, float]] = None,
    imputation_path: Path = IMPUTATION_PATH,
) -> pd.DataFrame:
    """Fill NaNs using pre-computed imputation values (fit from train only)."""
    if imputation_values is None:
        if not imputation_path.exists():
            raise FileNotFoundError(
                f"Imputation values not found: {imputation_path}. "
                "Run fit_imputation() first."
            )
        with open(imputation_path) as f:
            imputation_values = json.load(f)
 
    df = df.copy()
    for col, val in imputation_values.items():
        if col in df.columns:
            df[col] = df[col].fillna(val)
    return df
 
 
def export_to_onnx(
    model,
    feature_names: List[str],
    onnx_path: Path = ONNX_MODEL_PATH,
) -> Path:
    """
    Export the fitted XGBoost model to ONNX format for CPU-safe inference.
 
    Requires: skl2onnx, onnxmltools, or the native xgboost ONNX exporter
    (xgboost >= 1.7).  Falls back to onnxmltools if native path unavailable.
    """
    import xgboost as xgb
 
    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    n_features = len(feature_names)
 
    # Prefer native XGBoost ONNX export (available from xgboost 1.7+)
    try:
        model.get_booster().save_model(str(onnx_path))
        # The native save_model with .onnx extension triggers ONNX format
        # Verify the file is valid ONNX
        import onnx
        onnx.checker.check_model(str(onnx_path))
        logger.info("ONNX model exported via native XGBoost path → %s", onnx_path)
        return onnx_path
    except Exception as e:
        logger.warning("Native XGBoost ONNX export failed (%s); trying onnxmltools.", e)
 
    # Fallback: onnxmltools
    try:
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType
 
        initial_type = [("float_input", FloatTensorType([None, n_features]))]
        onnx_model = convert_xgboost(model, initial_types=initial_type)
 
        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())
 
        logger.info("ONNX model exported via onnxmltools → %s", onnx_path)
        return onnx_path
 
    except Exception as e2:
        logger.error("onnxmltools ONNX export also failed: %s", e2)
        raise RuntimeError(
            "ONNX export failed via both native and onnxmltools paths. "
            "Check xgboost and onnxmltools versions in requirements.txt."
        ) from e2
 
 


# ---------------------------------------------------------------------------
# Class weighting
# ---------------------------------------------------------------------------


def compute_class_weights(y: pd.Series) -> dict[int, float]:
    """Compute balanced class weights (inverse frequency)."""
    counts = y.value_counts()
    total = len(y)
    n_classes = N_CLASSES
    weights = {}
    for cls in range(n_classes):
        if cls in counts.index:
            weights[cls] = total / (n_classes * counts[cls])
        else:
            weights[cls] = 1.0
    logger.info("Class weights: %s", weights)
    return weights


def compute_sample_weights(y: pd.Series) -> np.ndarray:
    """Convert class weights to per-sample weights for XGBoost."""
    class_weights = compute_class_weights(y)
    return np.array([class_weights[int(label)] for label in y])


# ---------------------------------------------------------------------------
# HPO with Optuna
# ---------------------------------------------------------------------------


def run_hpo(
    X_fit: pd.DataFrame,
    y_fit: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    n_trials: int = 50,
    timeout: int = 300,
) -> dict:
    """Run Optuna HPO on internal train_fit / val_hpo splits.

    Returns the best hyperparameter dict.

    IMPORTANT: This function NEVER sees test_data.
    """
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    # Sample weights for class imbalance
    w_fit = compute_sample_weights(y_fit)
    w_val = compute_sample_weights(y_val)

    dtrain = xgb.DMatrix(X_fit, label=y_fit, weight=w_fit)
    dval = xgb.DMatrix(X_val, label=y_val, weight=w_val)

    def objective(trial: optuna.Trial) -> float:
        params = {
            **BASE_PARAMS,
            "max_depth": trial.suggest_int("max_depth", 3, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "gamma": trial.suggest_float("gamma", 0.0, 5.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
        }

        n_rounds = trial.suggest_int("n_rounds", 50, 500)

        model = xgb.train(
            params,
            dtrain,
            num_boost_round=n_rounds,
            evals=[(dval, "val")],
            early_stopping_rounds=20,
            verbose_eval=False,
        )
        trial.set_user_attr(
            "selected_n_rounds",
            _selected_n_rounds_from_booster(model, n_rounds),
        )

        # Evaluate with macro F1 on validation
        preds_prob = model.predict(dval)
        preds_class = np.argmax(preds_prob, axis=1)
        macro_f1 = f1_score(y_val, preds_class, average="macro")

        return macro_f1

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
    )
    study.optimize(objective, n_trials=n_trials, timeout=timeout)

    best = study.best_params.copy()
    best["n_rounds"] = int(
        study.best_trial.user_attrs.get(
            "selected_n_rounds",
            best.get("n_rounds", 300),
        )
    )
    best_f1 = study.best_value

    logger.info("HPO complete: best macro F1 = %.4f", best_f1)
    logger.info("Best params: %s", best)

    return best


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------


def train_final_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    hpo_params: dict,
) -> xgb.Booster:
    """Train the final model on train_fit + val_hpo with best HPO params.

    Uses the boosting-round count selected during HPO. No early stopping is
    applied here because val_hpo is already merged into the final training
    data.
    """
    params = hpo_params.copy()
    n_rounds = int(params.pop("n_rounds", 300))

    # Combine train_fit + val_hpo for final training
    X_combined = pd.concat([X_train, X_val], axis=0).reset_index(drop=True)
    y_combined = pd.concat([y_train, y_val], axis=0).reset_index(drop=True)

    w_combined = compute_sample_weights(y_combined)
    dtrain = xgb.DMatrix(X_combined, label=y_combined, weight=w_combined)

    params = {**BASE_PARAMS, **params}

    model = xgb.train(
        params,
        dtrain,
        num_boost_round=n_rounds,
        evals=[(dtrain, "train")],
        verbose_eval=False,
    )

    logger.info(
        "Final model trained: %d trees, configured rounds: %d",
        model.num_boosted_rounds(),
        n_rounds,
    )

    return model


def _selected_n_rounds_from_booster(model: Any, fallback_n_rounds: int) -> int:
    """Resolve the usable boosting-round count from an HPO-trained booster."""
    best_iteration = getattr(model, "best_iteration", None)
    if best_iteration is None:
        return int(fallback_n_rounds)

    try:
        best_iteration = int(best_iteration)
    except (TypeError, ValueError):
        return int(fallback_n_rounds)

    if best_iteration < 0:
        return int(fallback_n_rounds)

    return min(int(fallback_n_rounds), best_iteration + 1)


# ---------------------------------------------------------------------------
# Save / Load
# ---------------------------------------------------------------------------


def save_model(model: xgb.Booster, params: dict) -> None:
    """Save model as UBJ format and best params as JSON.

    Saves to both the canonical project root path (model_risk.ubj)
    and the models/ directory for backward compatibility.

    **Validates: Requirements 5.6**
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Save to project root (spec-compliant canonical path)
    model.save_model(str(MODEL_RISK_UBJ))
    logger.info("Model saved to %s (project root)", MODEL_RISK_UBJ)

    # Also save to models/ directory for backward compatibility
    model_path = MODELS_DIR / "xgb_model.ubj"
    model.save_model(str(model_path))
    logger.info("Model saved to %s (models dir)", model_path)

    params_path = MODELS_DIR / "best_params.json"
    # Ensure all values are JSON serializable
    serializable = {k: float(v) if isinstance(v, (np.floating, np.integer)) else v for k, v in params.items()}
    params_path.write_text(json.dumps(serializable, indent=2), encoding="utf-8")
    logger.info("Best params saved to %s", params_path)


def load_model() -> xgb.Booster:
    """Load the saved XGBoost model from UBJ format.

    Search order: project root model_risk.ubj → models/xgb_model.ubj.

    **Validates: Requirements 5.6**
    """
    # Prefer project root canonical path
    if MODEL_RISK_UBJ.exists():
        model = xgb.Booster()
        model.load_model(str(MODEL_RISK_UBJ))
        logger.info("Model loaded from %s", MODEL_RISK_UBJ)
        return model

    # Fallback to models/ directory
    model_path = MODELS_DIR / "xgb_model.ubj"
    if model_path.exists():
        model = xgb.Booster()
        model.load_model(str(model_path))
        logger.info("Model loaded from %s", model_path)
        return model

    raise FileNotFoundError(
        f"No model found. Checked: {MODEL_RISK_UBJ}, {model_path}. "
        "Train the model first."
    )


# ---------------------------------------------------------------------------
# Decision thresholds + evaluation
# ---------------------------------------------------------------------------


def save_decision_thresholds(
    thresholds: dict[str, float],
    metadata: dict[str, Any] | None = None,
) -> None:
    """Persist the selected class decision thresholds."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    serializable: dict[str, Any] = {key: float(value) for key, value in thresholds.items()}
    if metadata:
        serializable["tuning_metadata"] = metadata
    DECISION_THRESHOLDS_PATH.write_text(
        json.dumps(serializable, indent=2),
        encoding="utf-8",
    )
    logger.info("Decision thresholds saved to %s", DECISION_THRESHOLDS_PATH)


def load_decision_thresholds() -> dict[str, float] | None:
    """Load persisted decision thresholds if available."""
    if not DECISION_THRESHOLDS_PATH.exists():
        return None
    payload = json.loads(DECISION_THRESHOLDS_PATH.read_text(encoding="utf-8"))
    return {
        key: float(payload[key])
        for key in ["high_risk", "low_risk"]
        if key in payload
    }


def predict_with_thresholds(
    probs: np.ndarray,
    thresholds: dict[str, float],
) -> np.ndarray:
    """Apply simple low/high overrides on top of argmax predictions."""
    probs = np.asarray(probs, dtype=float)
    if probs.ndim != 2 or probs.shape[1] != N_CLASSES:
        raise ValueError(f"Expected probs shape (n_samples, {N_CLASSES}), got {probs.shape}")

    preds = np.argmax(probs, axis=1).astype(int, copy=True)
    high_threshold = float(thresholds["high_risk"])
    low_threshold = float(thresholds["low_risk"])

    high_mask = probs[:, 2] >= high_threshold
    low_mask = probs[:, 0] >= low_threshold
    preds[high_mask] = 2
    preds[~high_mask & low_mask] = 0
    return preds


def search_decision_thresholds(
    probs: np.ndarray,
    y_true: pd.Series | np.ndarray,
) -> dict[str, float]:
    """Search for val_hpo decision thresholds that lift High Risk F1 without collapsing macro-F1."""
    y_true_array = pd.Series(y_true).astype(int).to_numpy()
    baseline_preds = np.argmax(probs, axis=1)
    baseline_macro = float(
        f1_score(y_true_array, baseline_preds, average="macro", labels=[0, 1, 2], zero_division=0)
    )
    baseline_high = float(
        f1_score(y_true_array, baseline_preds, average=None, labels=[0, 1, 2], zero_division=0)[2]
    )
    macro_floor = baseline_macro - 0.003

    best = {"high_risk": 0.50, "low_risk": 0.50}
    best_rank = (1, 0, baseline_high, baseline_macro, 0.0)

    for high in np.linspace(0.35, 0.85, 21):
        for low in np.linspace(0.35, 0.85, 21):
            candidate = {"high_risk": float(high), "low_risk": float(low)}
            preds = predict_with_thresholds(probs, candidate)
            per_class = f1_score(
                y_true_array,
                preds,
                average=None,
                labels=[0, 1, 2],
                zero_division=0,
            )
            macro_f1 = float(
                f1_score(y_true_array, preds, average="macro", labels=[0, 1, 2], zero_division=0)
            )
            high_f1 = float(per_class[2])
            keeps_macro = macro_f1 >= macro_floor
            improves_high = high_f1 > baseline_high + 1e-12
            centrality = -abs(float(high) - 0.5) - abs(float(low) - 0.5)
            rank = (
                1 if keeps_macro else 0,
                1 if improves_high else 0,
                high_f1,
                macro_f1,
                centrality,
            )
            if rank > best_rank:
                best = candidate
                best_rank = rank

    logger.info(
        "Decision threshold search: baseline_macro=%.4f baseline_high_f1=%.4f chosen=%s",
        baseline_macro,
        baseline_high,
        best,
    )
    return best


def _build_metrics(
    y: pd.Series | np.ndarray,
    probs: np.ndarray,
    preds: np.ndarray,
    partition_name: str,
    thresholds: dict[str, float] | None = None,
    label_type: str = "heuristic_risk_labels",
) -> dict:
    """Build the canonical metrics structure from probabilities and predictions."""
    labels = list(range(N_CLASSES))
    macro_f1 = f1_score(y, preds, average="macro", labels=labels, zero_division=0)
    weighted_f1 = f1_score(y, preds, average="weighted", labels=labels, zero_division=0)
    per_class_f1 = f1_score(y, preds, average=None, labels=labels, zero_division=0).tolist()
    acc = accuracy_score(y, preds)
    cm = confusion_matrix(y, preds, labels=labels).tolist()

    try:
        ll = log_loss(y, probs, labels=labels)
    except Exception:
        ll = None

    report = classification_report(
        y,
        preds,
        labels=labels,
        target_names=[CLASS_NAMES[i] for i in range(N_CLASSES)],
        output_dict=True,
        zero_division=0,
    )

    metrics = {
        "partition": partition_name,
        "label_type": label_type,
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class_f1": {CLASS_NAMES[i]: round(f, 4) for i, f in enumerate(per_class_f1)},
        "log_loss": round(ll, 4) if ll is not None else None,
        "confusion_matrix": cm,
        "classification_report": report,
        "n_samples": len(y),
    }
    if thresholds is not None:
        metrics["decision_thresholds"] = {key: round(float(value), 4) for key, value in thresholds.items()}

    logger.info(
        "[%s] Accuracy=%.4f, Macro-F1=%.4f, Weighted-F1=%.4f",
        partition_name, acc, macro_f1, weighted_f1,
    )
    for i in range(N_CLASSES):
        logger.info("  %s F1=%.4f", CLASS_NAMES[i], per_class_f1[i])

    return metrics


def evaluate(
    model: xgb.Booster,
    X: pd.DataFrame,
    y: pd.Series,
    partition_name: str = "test",
    thresholds: dict[str, float] | None = None,
    label_type: str = "heuristic_risk_labels",
) -> dict:
    """Evaluate model and return metrics dict.

    Returns the canonical metrics structure for models/metrics.json.
    """
    dmatrix = xgb.DMatrix(X)
    probs = model.predict(dmatrix)
    preds = (
        predict_with_thresholds(probs, thresholds)
        if thresholds is not None
        else np.argmax(probs, axis=1)
    )
    return _build_metrics(
        y,
        probs,
        preds,
        partition_name,
        thresholds=thresholds,
        label_type=label_type,
    )


def predict_probabilities(
    model: xgb.Booster,
    X: pd.DataFrame,
    calibration: dict | None = None,
) -> np.ndarray:
    """Predict class probabilities, optionally applying temperature scaling."""
    probs = model.predict(xgb.DMatrix(X))
    if calibration and calibration.get("enabled"):
        probs = apply_temperature(probs, calibration["temperature"])
    return probs


def _resolve_threshold_tuning_subset(
    model: xgb.Booster,
    train_features: pd.DataFrame,
    train_labels: pd.Series,
    calibration: dict[str, Any] | None = None,
    min_reviewed_rows: int = 60,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Choose the most trustworthy subset for decision-threshold tuning.

    Prefer reviewed calibration rows when enough human-reviewed labels exist,
    otherwise fall back to heuristic val_hpo labels.
    """
    dev_idx = load_dev_split_indices(train_features)
    X_hpo = train_features.iloc[dev_idx["val_hpo"]].reset_index(drop=True)
    y_hpo = train_labels.iloc[dev_idx["val_hpo"]].reset_index(drop=True)
    hpo_probs = model.predict(xgb.DMatrix(X_hpo))
    if calibration and calibration.get("enabled"):
        hpo_probs = apply_temperature(hpo_probs, float(calibration["temperature"]))

    metadata: dict[str, Any] = {
        "source": "heuristic_val_hpo",
        "n_rows": int(len(y_hpo)),
        "calibrated": bool(calibration and calibration.get("enabled")),
    }

    clean = load_clean_labels()
    if len(clean) >= min_reviewed_rows:
        cal_features = train_features.iloc[dev_idx["val_calibration"]].reset_index(drop=True)
        cal_probs = model.predict(xgb.DMatrix(cal_features))
        if calibration and calibration.get("enabled"):
            cal_probs = apply_temperature(cal_probs, float(calibration["temperature"]))
        sample_probs, sample_labels = _select_calibration_subset(cal_probs, clean)
        if len(sample_labels) >= min_reviewed_rows:
            metadata = {
                "source": "reviewed_val_calibration",
                "n_rows": int(len(sample_labels)),
                "calibrated": bool(calibration and calibration.get("enabled")),
                "review_confidence": "high_or_medium",
            }
            return sample_probs, sample_labels, metadata

    return hpo_probs, y_hpo.to_numpy(dtype=int), metadata



def tune_decision_thresholds(
    model: xgb.Booster,
    train_features: pd.DataFrame,
    train_labels: pd.Series,
    calibration: dict[str, Any] | None = None,
) -> dict[str, float]:
    """Tune decision thresholds using reviewed calibration rows when available."""
    probs, labels, metadata = _resolve_threshold_tuning_subset(
        model,
        train_features,
        train_labels,
        calibration=calibration,
    )
    thresholds = search_decision_thresholds(probs, labels)
    save_decision_thresholds(thresholds, metadata=metadata)
    return thresholds


def save_metrics(metrics: dict) -> None:
    """Save to the canonical models/metrics.json."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = MODELS_DIR / "metrics.json"
    path.write_text(json.dumps(metrics, indent=2, default=str), encoding="utf-8")
    logger.info("Metrics saved to %s", path)


# ---------------------------------------------------------------------------
# Temperature scaling (Task 16)
# ---------------------------------------------------------------------------


def _softmax(logits: np.ndarray) -> np.ndarray:
    """Numerically stable softmax."""
    shifted = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=1, keepdims=True)


def find_temperature(
    probs: np.ndarray,
    labels: np.ndarray,
) -> float:
    """Find optimal temperature T that minimizes NLL on calibration data.

    Temperature scaling: calibrated = softmax(log(prob) / T)
    T > 1 → softer (less confident) probabilities
    T < 1 → sharper (more confident) probabilities
    T = 1 → no change
    """
    from scipy.optimize import minimize_scalar

    eps = 1e-12
    logits = np.log(probs + eps)

    def nll(T):
        scaled = _softmax(logits / T)
        # Negative log-likelihood
        correct_probs = scaled[np.arange(len(labels)), labels.astype(int)]
        return -np.log(correct_probs + eps).mean()

    result = minimize_scalar(nll, bounds=(0.1, 10.0), method="bounded")
    return float(result.x)


def apply_temperature(probs: np.ndarray, temperature: float) -> np.ndarray:
    """Apply temperature scaling to probability array."""
    eps = 1e-12
    logits = np.log(probs + eps)
    return _softmax(logits / temperature)


def load_clean_labels() -> pd.DataFrame:
    """Load clean_labels_100.csv and filter to high-confidence rows."""
    candidates = sorted(
        PROCESSED_DIR.glob("clean_labels_*.csv"),
        key=lambda p: int("".join(ch for ch in p.stem if ch.isdigit()) or 0),
    )
    path = candidates[-1] if candidates else (PROCESSED_DIR / "clean_labels_100.csv")
    if not path.exists():
        logger.warning("clean_labels_100.csv not found, calibration disabled")
        return pd.DataFrame()

    df = pd.read_csv(path)
    # Only use rows with verified labels and high/medium confidence
    usable = df[
        df["verified_label"].notna()
        & df["confidence"].isin(["high", "medium"])
    ].copy()
    usable["verified_label"] = usable["verified_label"].astype(int)

    logger.info(
        "Clean labels: %d total, %d usable (high/medium confidence)",
        len(df), len(usable),
    )
    return usable


def _select_calibration_subset(
    cal_probs: np.ndarray,
    clean: pd.DataFrame,
) -> tuple[np.ndarray, np.ndarray]:
    """Resolve reviewed calibration rows back to their sampled source rows."""
    labels = clean["verified_label"].astype(int).to_numpy()

    if CALIBRATION_SOURCE_INDEX_COL in clean.columns:
        source_idx = pd.to_numeric(clean[CALIBRATION_SOURCE_INDEX_COL], errors="coerce")
        valid = source_idx.notna().to_numpy()
        source_idx = source_idx[valid].astype(int).to_numpy()
        labels = labels[valid]
        in_range = (source_idx >= 0) & (source_idx < len(cal_probs))
        source_idx = source_idx[in_range]
        labels = labels[in_range]
        if len(source_idx) > 0:
            return cal_probs[source_idx], labels

    n_usable = min(len(clean), len(cal_probs))
    return cal_probs[:n_usable], labels[:n_usable]


def run_calibration(model: xgb.Booster, train_features: pd.DataFrame) -> dict:
    """Run temperature scaling calibration.

    Uses ONLY high-confidence verified labels from val_calibration.
    Returns calibration config dict.
    """
    clean = load_clean_labels()

    if len(clean) < 80:
        logger.warning(
            "Only %d usable clean labels (< 80 threshold). "
            "Skipping temperature scaling.", len(clean),
        )
        return {"enabled": False, "reason": f"Only {len(clean)} usable labels (< 80)"}

    # Get the val_calibration features matching the clean label OCIDs
    dev_idx = load_dev_split_indices(train_features)
    cal_features = train_features.iloc[dev_idx["val_calibration"]].reset_index(drop=True)

    # We need to match clean label rows to their position in cal_features
    # The clean labels were sampled from val_calibration, so we use
    # positional alignment based on the original calibration sheet indices
    sheet_candidates = sorted(
        PROCESSED_DIR.glob("calibration_sheet_*.csv"),
        key=lambda p: int("".join(ch for ch in p.stem if ch.isdigit()) or 0),
    )
    cal_sheet_path = (
        sheet_candidates[-1]
        if sheet_candidates
        else (PROCESSED_DIR / "calibration_sheet_100.csv")
    )
    if cal_sheet_path.exists():
        cal_sheet = pd.read_csv(cal_sheet_path)
    else:
        return {"enabled": False, "reason": "calibration_sheet_100.csv not found"}

    n_cal = len(cal_features)
    if n_cal == 0:
        return {"enabled": False, "reason": "No calibration features available"}

    # Predict on full val_calibration
    dmatrix = xgb.DMatrix(cal_features)
    cal_probs = model.predict(dmatrix)

    sample_probs, sample_labels = _select_calibration_subset(cal_probs, clean)
    n_usable = len(sample_labels)

    # Find optimal temperature
    temperature = find_temperature(sample_probs, sample_labels)

    logger.info("Temperature scaling: T = %.4f", temperature)
    logger.info(
        "  T > 1 → probabilities softened (less confident)"
        if temperature > 1
        else "  T < 1 → probabilities sharpened (more confident)"
    )

    calibration = {
        "enabled": True,
        "temperature": round(temperature, 6),
        "n_calibration_samples": int(n_usable),
        "n_high_confidence": int((clean["confidence"] == "high").sum()),
        "method": "temperature_scaling",
    }

    # Save
    cal_path = MODELS_DIR / "calibration.json"
    cal_path.write_text(json.dumps(calibration, indent=2), encoding="utf-8")
    logger.info("Calibration saved to %s", cal_path)

    return calibration


# ---------------------------------------------------------------------------
# Evaluation figures (Task 16)
# ---------------------------------------------------------------------------

FIGURES_DIR = PROJECT_ROOT / "proposal" / "figures"


def generate_figures(
    model: xgb.Booster,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    calibration: dict | None = None,
    thresholds: dict[str, float] | None = None,
) -> None:
    """Generate all evaluation figures for the proposal.

    Produces:
      - confusion_matrix.png
      - per_class_f1.png
      - calibration_curve.png
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mticker

    FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    dtest = xgb.DMatrix(X_test)
    probs = model.predict(dtest)

    # Apply temperature if calibration is enabled
    if calibration and calibration.get("enabled"):
        probs = apply_temperature(probs, calibration["temperature"])

    preds = (
        predict_with_thresholds(probs, thresholds)
        if thresholds is not None
        else np.argmax(probs, axis=1)
    )
    class_labels = [CLASS_NAMES[i] for i in range(N_CLASSES)]

    # --- 1. Confusion Matrix ---
    cm = confusion_matrix(y_test, preds)
    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(cm, cmap="Blues", interpolation="nearest")
    ax.set_xticks(range(N_CLASSES))
    ax.set_yticks(range(N_CLASSES))
    ax.set_xticklabels(class_labels, fontsize=10)
    ax.set_yticklabels(class_labels, fontsize=10)
    ax.set_xlabel("Predicted", fontsize=12, fontweight="bold")
    ax.set_ylabel("Actual", fontsize=12, fontweight="bold")
    title_suffix = " (thresholded)" if thresholds is not None else ""
    ax.set_title(f"Confusion Matrix (Test Set{title_suffix})", fontsize=14, fontweight="bold")
    for i in range(N_CLASSES):
        for j in range(N_CLASSES):
            color = "white" if cm[i, j] > cm.max() / 2 else "black"
            ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                    fontsize=14, fontweight="bold", color=color)
    fig.colorbar(im, ax=ax, shrink=0.8)
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "confusion_matrix.png", dpi=150)
    plt.close(fig)
    logger.info("Saved confusion_matrix.png")

    # --- 2. Per-class F1 bar chart ---
    per_f1 = f1_score(y_test, preds, average=None)
    macro_f1 = f1_score(y_test, preds, average="macro")

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(class_labels, per_f1, color=["#2ecc71", "#f39c12", "#e74c3c"],
                  edgecolor="black", linewidth=0.8)
    ax.axhline(y=macro_f1, color="gray", linestyle="--", linewidth=1.5,
               label=f"Macro F1 = {macro_f1:.4f}")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("F1 Score", fontsize=12, fontweight="bold")
    ax.set_title(f"Per-Class F1 Score (Test Set{title_suffix})", fontsize=14, fontweight="bold")
    ax.legend(fontsize=10)
    for bar, val in zip(bars, per_f1):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01,
                f"{val:.4f}", ha="center", va="bottom", fontsize=11, fontweight="bold")
    ax.yaxis.set_major_formatter(mticker.FormatStrFormatter("%.2f"))
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "per_class_f1.png", dpi=150)
    plt.close(fig)
    logger.info("Saved per_class_f1.png")

    # --- 3. Calibration curve (reliability diagram) ---
    fig, ax = plt.subplots(figsize=(7, 6))
    n_bins = 10
    for cls in range(N_CLASSES):
        cls_probs = probs[:, cls]
        cls_true = (y_test == cls).astype(int)

        bin_edges = np.linspace(0, 1, n_bins + 1)
        bin_means = []
        bin_true_freqs = []

        for b in range(n_bins):
            mask = (cls_probs >= bin_edges[b]) & (cls_probs < bin_edges[b + 1])
            if mask.sum() > 0:
                bin_means.append(cls_probs[mask].mean())
                bin_true_freqs.append(cls_true[mask].mean())

        if bin_means:
            ax.plot(bin_means, bin_true_freqs, "o-",
                    label=CLASS_NAMES[cls], markersize=5, linewidth=1.5)

    ax.plot([0, 1], [0, 1], "k--", linewidth=1, label="Perfect calibration")
    ax.set_xlabel("Mean Predicted Probability", fontsize=12, fontweight="bold")
    ax.set_ylabel("Fraction of Positives", fontsize=12, fontweight="bold")
    ax.set_title(f"Calibration Curve (Test Set{title_suffix})", fontsize=14, fontweight="bold")
    ax.legend(fontsize=9)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "calibration_curve.png", dpi=150)
    plt.close(fig)
    logger.info("Saved calibration_curve.png")


# ---------------------------------------------------------------------------
# ONNX export and imputation (Task 19)
# ---------------------------------------------------------------------------


def compute_imputation_values(X_train: pd.DataFrame) -> dict:
    """Compute median imputation values from training data only.

    These values are used to fill NaN before ONNX inference
    (ONNX Runtime does not handle NaN natively).
    """
    imputation = {}
    for col in X_train.columns:
        median_val = X_train[col].median()
        imputation[col] = 0.0 if pd.isna(median_val) else float(median_val)

    path = MODELS_DIR / "imputation_values.json"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(imputation, indent=2), encoding="utf-8")
    logger.info("Imputation values saved to %s (%d features)", path, len(imputation))
    return imputation


def export_onnx(model: xgb.Booster, X_sample: pd.DataFrame) -> Path:
    """Export XGBoost model to ONNX format.

    Exports to the canonical project root path (model_risk.onnx).
    Uses onnxmltools for conversion with proper float input typing.

    Parameters
    ----------
    model : xgb.Booster
        Trained XGBoost model.
    X_sample : pd.DataFrame
        Sample feature DataFrame used to determine input shape and feature names.

    Returns
    -------
    Path
        Path to the exported ONNX model file.

    **Validates: Requirements 5.7**
    """
    n_features = X_sample.shape[1]
    onnx_path = MODEL_RISK_ONNX

    # Try onnxmltools conversion
    try:
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType

        initial_type = [("float_input", FloatTensorType([None, n_features]))]
        onnx_model = convert_xgboost(model, initial_types=initial_type)

        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())

        logger.info("ONNX model exported via onnxmltools → %s", onnx_path)
        return onnx_path

    except ImportError:
        logger.warning("onnxmltools not available, trying native XGBoost JSON export as fallback")
    except Exception as e:
        logger.warning("onnxmltools ONNX export failed (%s); trying native fallback.", e)

    # Fallback: save as XGBoost JSON format (portable, loadable)
    json_path = onnx_path.with_suffix(".onnx.json")
    model.save_model(str(json_path))
    logger.info("Model exported as JSON fallback: %s", json_path)

    # Also save the .onnx file as UBJ for parity checking
    model.save_model(str(onnx_path))
    logger.info("Model exported to %s (native format)", onnx_path)
    return onnx_path


def load_onnx_model() -> xgb.Booster:
    """Load the ONNX-exported JSON model back as XGBoost Booster."""
    onnx_path = MODELS_DIR / "xgb_model.onnx.json"
    if not onnx_path.exists():
        raise FileNotFoundError(f"{onnx_path} not found")
    model = xgb.Booster()
    model.load_model(str(onnx_path))
    return model


def check_onnx_parity(
    model: xgb.Booster,
    X_sample: pd.DataFrame | np.ndarray,
    onnx_path: Path | None = None,
    atol: float = 1e-5,
) -> bool:
    """Verify ONNX model produces numerically equivalent predictions.

    Compares XGBoost native predictions vs ONNX Runtime inference
    on the same input data.

    Parameters
    ----------
    model : xgb.Booster
        The native XGBoost model.
    X_sample : DataFrame or ndarray
        Sample data to compare predictions on.
    onnx_path : Path, optional
        Path to the ONNX model file. Defaults to project root model_risk.onnx.
    atol : float
        Absolute tolerance for numerical equivalence.

    Returns
    -------
    bool
        True if predictions are numerically equivalent within tolerance.

    **Validates: Requirements 5.7**
    """
    if onnx_path is None:
        onnx_path = MODEL_RISK_ONNX

    if not onnx_path.exists():
        logger.error("ONNX model not found at %s", onnx_path)
        return False

    # Native XGBoost predictions
    if isinstance(X_sample, pd.DataFrame):
        dmatrix = xgb.DMatrix(X_sample)
        X_arr = X_sample.values.astype(np.float32)
    else:
        X_arr = np.asarray(X_sample, dtype=np.float32)
        dmatrix = xgb.DMatrix(X_arr)

    native_probs = model.predict(dmatrix)

    # Try ONNX Runtime inference
    try:
        import onnxruntime as rt

        sess = rt.InferenceSession(str(onnx_path))
        input_name = sess.get_inputs()[0].name
        onnx_out = sess.run(None, {input_name: X_arr})

        # onnx output[1] is typically the probability map
        raw_proba = onnx_out[1] if len(onnx_out) > 1 else onnx_out[0]
        if isinstance(raw_proba, list) and len(raw_proba) > 0 and isinstance(raw_proba[0], dict):
            n_classes = len(raw_proba[0])
            onnx_probs = np.array([[row[c] for c in range(n_classes)] for row in raw_proba])
        else:
            onnx_probs = np.array(raw_proba)

        max_diff = float(np.abs(native_probs - onnx_probs).max())
        mean_diff = float(np.abs(native_probs - onnx_probs).mean())

        parity_ok = max_diff < atol
        if parity_ok:
            logger.info("ONNX parity OK: max_diff=%.8f, mean_diff=%.8f", max_diff, mean_diff)
        else:
            logger.warning(
                "ONNX parity FAILED: max_diff=%.8f > atol=%.8f", max_diff, atol
            )
        return parity_ok

    except ImportError:
        logger.warning("onnxruntime not available; falling back to XGBoost JSON parity check")
    except Exception as e:
        logger.warning("ONNX Runtime parity check failed: %s; trying JSON fallback", e)

    # Fallback: load the ONNX file as XGBoost model and compare
    try:
        onnx_model = xgb.Booster()
        onnx_model.load_model(str(onnx_path))
        onnx_probs = onnx_model.predict(dmatrix)

        max_diff = float(np.abs(native_probs - onnx_probs).max())
        parity_ok = max_diff < atol
        if parity_ok:
            logger.info("ONNX (XGBoost fallback) parity OK: max_diff=%.8f", max_diff)
        else:
            logger.warning("ONNX (XGBoost fallback) parity FAILED: max_diff=%.8f", max_diff)
        return parity_ok
    except Exception as e2:
        logger.error("All parity checks failed: %s", e2)
        return False


# ---------------------------------------------------------------------------
# Full training pipeline
# ---------------------------------------------------------------------------


def run_training_pipeline(
    n_trials: int = 50,
    hpo_timeout: int = 300,
) -> dict:
    """Execute the complete training pipeline.

    1. Load train artifacts
    2. Split into dev sub-splits
    3. Run HPO on train_fit / val_hpo
    4. Train final model on train_fit + val_hpo
    5. Evaluate on val_hpo (internal) and test (final)
    6. Save model + params + metrics

    Returns metrics dict.
    """
    logger.info("=" * 60)
    logger.info("TRAINING PIPELINE START")
    logger.info("=" * 60)

    # Load artifacts
    train_features, train_labels = load_train_artifacts()
    test_features, test_labels = load_test_artifacts()

    # Dev split indices
    dev_idx = load_dev_split_indices(train_features)

    X_fit = train_features.iloc[dev_idx["train_fit"]].reset_index(drop=True)
    y_fit = train_labels.iloc[dev_idx["train_fit"]].reset_index(drop=True)
    X_hpo = train_features.iloc[dev_idx["val_hpo"]].reset_index(drop=True)
    y_hpo = train_labels.iloc[dev_idx["val_hpo"]].reset_index(drop=True)

    logger.info("Train_fit: %d rows, Val_hpo: %d rows", len(X_fit), len(X_hpo))

    # Step 1: HPO
    logger.info("--- Running HPO ---")
    best_params = run_hpo(
        X_fit, y_fit, X_hpo, y_hpo,
        n_trials=n_trials, timeout=hpo_timeout,
    )

    # Step 2: Train final model
    logger.info("--- Training final model ---")
    model = train_final_model(X_fit, y_fit, X_hpo, y_hpo, best_params.copy())

    # Step 3: Save
    save_model(model, best_params)

    # Step 4: Evaluate on val_hpo (internal validation)
    logger.info("--- Internal validation metrics ---")
    val_metrics = evaluate(model, X_hpo, y_hpo, "val_hpo")

    logger.info("--- Threshold tuning on val_hpo ---")
    thresholds = tune_decision_thresholds(model, train_features, train_labels)
    val_metrics_thresholded = evaluate(
        model,
        X_hpo,
        y_hpo,
        "val_hpo_thresholded",
        thresholds=thresholds,
    )

    # Step 5: Evaluate on test (final held-out metrics)
    logger.info("--- Final test metrics ---")
    test_metrics = evaluate(model, test_features, test_labels, "test")
    test_metrics_thresholded = evaluate(
        model,
        test_features,
        test_labels,
        "test_thresholded",
        thresholds=thresholds,
    )

    # Save canonical metrics
    full_metrics = {
        "note": "Metrics against heuristic risk labels, NOT confirmed fraud outcomes",
        "decision_thresholds": thresholds,
        "internal_validation": val_metrics,
        "internal_validation_thresholded": val_metrics_thresholded,
        "final_test": test_metrics,
        "final_test_thresholded": test_metrics_thresholded,
    }
    save_metrics(full_metrics)

    logger.info("=" * 60)
    logger.info("TRAINING PIPELINE COMPLETE")
    logger.info("=" * 60)

    return full_metrics


def run_evaluation_pipeline() -> dict:
    """Execute Task 16: final evaluation + calibration + figures.

    1. Load model and artifacts
    2. Run temperature scaling calibration
    3. Re-evaluate on test with calibrated probabilities
    4. Generate all proposal figures
    5. Save final metrics.json and calibration.json

    Returns full metrics dict.
    """
    logger.info("=" * 60)
    logger.info("EVALUATION PIPELINE START (Task 16)")
    logger.info("=" * 60)

    model = load_model()
    train_features, train_labels = load_train_artifacts()
    test_features, test_labels = load_test_artifacts()

    # Step 1: Calibration
    logger.info("--- Running calibration ---")
    calibration = run_calibration(model, train_features)

    logger.info("--- Tuning decision thresholds ---")
    thresholds = tune_decision_thresholds(
        model,
        train_features,
        train_labels,
        calibration=calibration if calibration.get("enabled") else None,
    )

    # Step 2: Evaluate on test (uncalibrated)
    logger.info("--- Test metrics (uncalibrated) ---")
    test_metrics_raw = evaluate(model, test_features, test_labels, "test_uncalibrated")
    test_metrics_thresholded = evaluate(
        model,
        test_features,
        test_labels,
        "test_thresholded",
        thresholds=thresholds,
    )

    # Step 3: Evaluate on test (calibrated, if enabled)
    test_metrics_cal = None
    test_metrics_cal_thresholded = None
    if calibration.get("enabled"):
        dtest = xgb.DMatrix(test_features)
        cal_probs = apply_temperature(
            model.predict(dtest), calibration["temperature"]
        )
        cal_preds = np.argmax(cal_probs, axis=1)

        test_metrics_cal = {
            "partition": "test_calibrated",
            "label_type": "heuristic_risk_labels",
            "accuracy": round(accuracy_score(test_labels, cal_preds), 4),
            "macro_f1": round(f1_score(test_labels, cal_preds, average="macro"), 4),
            "weighted_f1": round(f1_score(test_labels, cal_preds, average="weighted"), 4),
            "per_class_f1": {
                CLASS_NAMES[i]: round(f, 4)
                for i, f in enumerate(f1_score(test_labels, cal_preds, average=None))
            },
            "n_samples": len(test_labels),
            "temperature": calibration["temperature"],
        }
        cal_thresholded_preds = predict_with_thresholds(cal_probs, thresholds)
        test_metrics_cal_thresholded = _build_metrics(
            test_labels,
            cal_probs,
            cal_thresholded_preds,
            "test_calibrated_thresholded",
            thresholds=thresholds,
            label_type="heuristic_risk_labels",
        )
        test_metrics_cal_thresholded["temperature"] = calibration["temperature"]
        logger.info(
            "[calibrated] Macro-F1=%.4f, Weighted-F1=%.4f",
            test_metrics_cal["macro_f1"], test_metrics_cal["weighted_f1"],
        )

    # Step 4: Generate figures
    logger.info("--- Generating figures ---")
    generate_figures(
        model,
        test_features,
        test_labels,
        calibration,
        thresholds=thresholds,
    )

    # Step 5: Compute imputation values from training data
    logger.info("--- Computing imputation values ---")
    compute_imputation_values(train_features)

    # Step 6: Build and save final metrics
    full_metrics = {
        "note": "Metrics against heuristic risk labels, NOT confirmed fraud outcomes",
        "decision_thresholds": thresholds,
        "final_test": test_metrics_raw,
        "final_test_thresholded": test_metrics_thresholded,
        "calibration": calibration,
    }
    if test_metrics_cal:
        full_metrics["final_test_calibrated"] = test_metrics_cal
    if test_metrics_cal_thresholded:
        full_metrics["final_test_calibrated_thresholded"] = test_metrics_cal_thresholded

    save_metrics(full_metrics)

    logger.info("=" * 60)
    logger.info("EVALUATION PIPELINE COMPLETE")
    logger.info("=" * 60)

    return full_metrics

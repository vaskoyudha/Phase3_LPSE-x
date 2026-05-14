from pathlib import Path

import pytest

from src.artifacts import resolve_model_artifact
from src.product_demo import load_demo_dataset, load_prediction_backend


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_submitted_model_artifacts_are_resolved_without_regeneration():
    """Validates: Requirements 1.2, 1.3"""
    ubj = resolve_model_artifact("ubj", project_root=PROJECT_ROOT)
    onnx = resolve_model_artifact("onnx", project_root=PROJECT_ROOT)

    assert ubj.name == "model_risk.ubj"
    assert onnx.name == "model_risk.onnx"
    assert ubj.is_file()
    assert onnx.is_file()
    # Resolved paths must be absolute
    assert ubj.is_absolute()
    assert onnx.is_absolute()


def test_ubj_backend_loads_feature_names_for_safe_alignment():
    """Validates: Requirements 1.2, 1.3"""
    backend = load_prediction_backend(PROJECT_ROOT / "model_risk.ubj")

    assert backend.kind == "xgboost"
    assert backend.model_artifact.name == "model_risk.ubj"
    assert len(backend.feature_names) >= 10
    assert "f_tender_value_log" in backend.feature_names


def test_product_resolver_rejects_legacy_model_fallback(tmp_path):
    """Validates: Requirements 1.5"""
    legacy_dir = tmp_path / "models"
    legacy_dir.mkdir()
    (legacy_dir / "xgb_model.ubj").write_bytes(b"legacy placeholder")
    (legacy_dir / "xgb_model.onnx").write_bytes(b"legacy placeholder")

    with pytest.raises(FileNotFoundError, match="model_risk.ubj"):
        resolve_model_artifact("ubj", project_root=tmp_path)
    with pytest.raises(FileNotFoundError, match="model_risk.onnx"):
        resolve_model_artifact("onnx", project_root=tmp_path)


def test_onnx_backend_reuses_submitted_ubj_feature_order_for_alignment():
    """Validates: Requirements 1.2, 1.3"""
    dataset = load_demo_dataset(max_rows=2)
    backend = load_prediction_backend(PROJECT_ROOT / "model_risk.onnx", kind="onnx")

    assert backend.kind == "onnx"
    assert backend.model_artifact.name == "model_risk.onnx"
    assert "f_tender_value_log" in backend.feature_names
    probabilities = backend.predict_proba(dataset.features)
    assert probabilities.shape == (2, 3)


def test_explicit_path_preference(tmp_path):
    """Validates: Requirements 1.3 (explicit path takes priority over default)"""
    # Create a custom artifact at a non-default location
    custom_artifact = tmp_path / "custom_model.ubj"
    custom_artifact.write_bytes((PROJECT_ROOT / "model_risk.ubj").read_bytes())

    resolved = resolve_model_artifact("ubj", explicit_path=custom_artifact, project_root=tmp_path)
    assert resolved == custom_artifact.resolve()


def test_file_not_found_error_includes_checked_paths(tmp_path):
    """Validates: Requirements 1.5 (error message lists all checked paths)"""
    with pytest.raises(FileNotFoundError) as exc_info:
        resolve_model_artifact("ubj", project_root=tmp_path)

    error_msg = str(exc_info.value)
    # The error message must mention the expected artifact filename
    assert "model_risk.ubj" in error_msg
    # The error message must include the word "Checked" indicating paths were listed
    assert "Checked" in error_msg

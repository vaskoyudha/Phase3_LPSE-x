import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_inference_notebook_uses_submitted_artifacts_and_full_test_split():
    notebook = json.loads((PROJECT_ROOT / "inference.ipynb").read_text(encoding="utf-8"))
    source = "\n".join("".join(cell.get("source", [])) for cell in notebook.get("cells", []))

    assert "model_risk.ubj" in source
    assert "model_risk.onnx" in source
    assert "test_data/features.parquet" in source
    assert "build_inference_run(max_rows=None" in source
    assert "models/xgb_model.ubj" not in source
    assert "models/xgb_model.onnx" not in source
    assert ".fit(" not in source
    assert "train_data/" not in source


def test_model_only_repo_excludes_backend_and_frontend_implementation():
    forbidden_paths = [
        PROJECT_ROOT / "frontend",
        PROJECT_ROOT / "app.py",
        PROJECT_ROOT / "src" / "api.py",
        PROJECT_ROOT / "src" / "api_schemas.py",
        PROJECT_ROOT / "src" / "reviews.py",
        PROJECT_ROOT / "package.json",
        PROJECT_ROOT / "package-lock.json",
    ]
    assert [str(path.relative_to(PROJECT_ROOT)) for path in forbidden_paths if path.exists()] == []


def test_requirements_are_model_only_not_backend_or_frontend_runtime():
    requirements = (PROJECT_ROOT / "requirements.txt").read_text(encoding="utf-8").lower()
    assert "xgboost" in requirements
    assert "onnxruntime" in requirements
    assert "fastapi" not in requirements
    assert "uvicorn" not in requirements
    assert "streamlit" not in requirements

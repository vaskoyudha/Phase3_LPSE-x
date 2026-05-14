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


def test_frontend_dependencies_are_exactly_pinned_not_latest():
    package = json.loads((PROJECT_ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    specs = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    assert specs
    floating = {name: spec for name, spec in specs.items() if spec == "latest" or str(spec).startswith("^")}
    assert floating == {}

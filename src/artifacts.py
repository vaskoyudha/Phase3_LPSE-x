"""Artifact resolution helpers for offline LPSE-X product demos."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

PROJECT_ROOT = Path(__file__).resolve().parents[1]

ArtifactKind = Literal["ubj", "onnx"]

_ACCEPTED_ARTIFACTS: dict[ArtifactKind, tuple[Path, ...]] = {
    "ubj": (Path("model_risk.ubj"),),
    "onnx": (Path("model_risk.onnx"),),
}


def _as_project_path(path: Path, root: Path) -> Path:
    return path if path.is_absolute() else root / path


def resolve_model_artifact(
    kind: ArtifactKind,
    explicit_path: Path | str | None = None,
    *,
    project_root: Path | None = None,
) -> Path:
    """Return an existing accepted model artifact path without retraining.

    Search order is explicit path, then accepted submitted root artifact
    (``model_risk.*``). This helper only reads filesystem state; it never
    creates, moves, replaces, trains, tunes, or exports a model artifact.
    """
    root = project_root or PROJECT_ROOT
    if kind not in _ACCEPTED_ARTIFACTS:
        expected = ", ".join(sorted(_ACCEPTED_ARTIFACTS))
        raise ValueError(f"Unsupported artifact kind {kind!r}; expected one of: {expected}")

    candidates: list[Path] = []
    if explicit_path is not None:
        candidates.append(_as_project_path(Path(explicit_path), root))
    candidates.extend(root / path for path in _ACCEPTED_ARTIFACTS[kind])

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate.resolve()

    checked = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(
        f"No accepted LPSE-X {kind.upper()} model artifact found. Checked: {checked}. "
        "Run the offline demo with the submitted model_risk artifacts present; "
        "this product path does not retrain or regenerate models."
    )

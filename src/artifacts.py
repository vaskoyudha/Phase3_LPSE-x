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

# Legacy paths that are explicitly rejected even if they exist on disk.
_LEGACY_PATHS: dict[ArtifactKind, tuple[Path, ...]] = {
    "ubj": (Path("models/xgb_model.ubj"),),
    "onnx": (Path("models/xgb_model.onnx"),),
}


def _as_project_path(path: Path, root: Path) -> Path:
    """Resolve a path relative to project root if not already absolute."""
    return path if path.is_absolute() else root / path


def _is_legacy_path(candidate: Path, kind: ArtifactKind, root: Path) -> bool:
    """Return True if candidate matches a rejected legacy fallback path."""
    resolved_candidate = candidate.resolve()
    for legacy in _LEGACY_PATHS.get(kind, ()):
        if resolved_candidate == (root / legacy).resolve():
            return True
    return False


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

    Legacy fallback paths (e.g. ``models/xgb_model.*``) are explicitly
    rejected even if they exist on disk.

    Raises
    ------
    ValueError
        If *kind* is not one of the accepted artifact kinds.
    FileNotFoundError
        If no accepted artifact file is found at any candidate location.
    """
    root = project_root or PROJECT_ROOT
    if kind not in _ACCEPTED_ARTIFACTS:
        expected = ", ".join(sorted(_ACCEPTED_ARTIFACTS))
        raise ValueError(
            f"Unsupported artifact kind {kind!r}; expected one of: {expected}"
        )

    candidates: list[Path] = []

    # 1. Explicit path takes priority (if provided and not a legacy path)
    if explicit_path is not None:
        ep = _as_project_path(Path(explicit_path), root)
        if _is_legacy_path(ep, kind, root):
            # Reject legacy path even when explicitly provided
            candidates.append(ep)
        elif ep.exists() and ep.is_file():
            return ep.resolve()
        else:
            candidates.append(ep)

    # 2. Accepted root artifacts (model_risk.*)
    for rel_path in _ACCEPTED_ARTIFACTS[kind]:
        candidate = root / rel_path
        candidates.append(candidate)
        if candidate.exists() and candidate.is_file():
            return candidate.resolve()

    checked = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(
        f"No accepted LPSE-X {kind.upper()} model artifact found. "
        f"Checked: {checked}. "
        "Run the offline demo with the submitted model_risk artifacts present; "
        "this product path does not retrain or regenerate models."
    )

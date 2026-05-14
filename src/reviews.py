
"""SQLite review store for human decisions and signoff."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REVIEW_DB_PATH = PROJECT_ROOT / "reviews.db"

REVIEW_STATUSES = [
    "Perlu Review",
    "Ditandai Risiko",
    "Butuh Dokumen",
    "Selesai",
]


@dataclass
class ReviewRecord:
    case_id: str
    status: str
    reviewer_name: str | None
    notes: str | None
    decision_summary: str | None
    signed_off: bool
    signed_off_at: str | None
    package_snapshot: dict[str, Any] | None
    model_snapshot: dict[str, Any] | None
    event_history: list[dict[str, Any]]
    created_at: str
    updated_at: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ReviewStore:
    def __init__(self, db_path: Path | str = DEFAULT_REVIEW_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS reviews (
                    case_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    reviewer_name TEXT,
                    notes TEXT,
                    decision_summary TEXT,
                    signed_off INTEGER DEFAULT 0,
                    signed_off_at TEXT,
                    package_snapshot TEXT,
                    model_snapshot TEXT,
                    event_history TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def get_review(self, case_id: str) -> ReviewRecord | None:
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute(
                "SELECT * FROM reviews WHERE case_id = ?", (case_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_record(row)
        finally:
            conn.close()

    def list_reviews(self) -> list[ReviewRecord]:
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute("SELECT * FROM reviews ORDER BY updated_at DESC")
            rows = cursor.fetchall()
            return [self._row_to_record(row) for row in rows]
        finally:
            conn.close()

    def upsert_review(
        self,
        case_id: str,
        status: str,
        reviewer_name: str | None = None,
        notes: str | None = None,
        decision_summary: str | None = None,
        signed_off: bool = False,
        package_snapshot: dict[str, Any] | None = None,
        model_snapshot: dict[str, Any] | None = None,
        prefill: bool = False,
    ) -> ReviewRecord:
        import json

        now = _utc_now_iso()
        existing = self.get_review(case_id)

        if status not in REVIEW_STATUSES:
            raise ValueError(f"Status tidak valid: {status}. Pilih dari: {', '.join(REVIEW_STATUSES)}")

        event = {
            "timestamp": now,
            "status": status,
            "reviewer_name": reviewer_name,
        }

        if existing:
            event_history = existing.event_history
            event_history.append(event)
            signed_off_at = existing.signed_off_at
            if signed_off and not existing.signed_off:
                signed_off_at = now
        else:
            event_history = [event]
            signed_off_at = now if signed_off else None

        package_snapshot_json = json.dumps(package_snapshot) if package_snapshot else None
        model_snapshot_json = json.dumps(model_snapshot) if model_snapshot else None
        event_history_json = json.dumps(event_history)

        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO reviews (
                    case_id, status, reviewer_name, notes, decision_summary, signed_off, signed_off_at,
                    package_snapshot, model_snapshot, event_history, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    status,
                    reviewer_name,
                    notes,
                    decision_summary,
                    1 if signed_off else 0,
                    signed_off_at,
                    package_snapshot_json,
                    model_snapshot_json,
                    event_history_json,
                    existing.created_at if existing else now,
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        return self.get_review(case_id)

    def _row_to_record(self, row: tuple) -> ReviewRecord:
        import json
        case_id, status, reviewer_name, notes, decision_summary, signed_off, signed_off_at, package_snapshot_json, model_snapshot_json, event_history_json, created_at, updated_at = row
        return ReviewRecord(
            case_id=case_id,
            status=status,
            reviewer_name=reviewer_name,
            notes=notes,
            decision_summary=decision_summary,
            signed_off=bool(signed_off),
            signed_off_at=signed_off_at,
            package_snapshot=json.loads(package_snapshot_json) if package_snapshot_json else None,
            model_snapshot=json.loads(model_snapshot_json) if model_snapshot_json else None,
            event_history=json.loads(event_history_json) if event_history_json else [],
            created_at=created_at,
            updated_at=updated_at,
        )


def _draft_review(case_id: str, casebook_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Generate a draft review for a case that hasn't been saved yet."""
    return {
        "case_id": case_id,
        "status": "Perlu Review",
        "reviewer_name": None,
        "notes": None,
        "decision_summary": None,
        "signed_off": False,
        "signed_off_at": None,
        "package_snapshot": casebook_payload.get("metadata") if casebook_payload else None,
        "model_snapshot": casebook_payload.get("model_output") if casebook_payload else None,
        "event_history": [],
        "is_draft": True,
    }


def _review_snapshots(casebook_payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Extract package and model snapshots from casebook payload."""
    package_snapshot = casebook_payload.get("metadata", {})
    model_snapshot = casebook_payload.get("model_output", {})
    return package_snapshot, model_snapshot


def _review_record(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert ReviewRecord to a JSON-serializable dict."""
    if hasattr(payload, "__dict__"):
        return {
            "case_id": payload.case_id,
            "status": payload.status,
            "reviewer_name": payload.reviewer_name,
            "notes": payload.notes,
            "decision_summary": payload.decision_summary,
            "signed_off": payload.signed_off,
            "signed_off_at": payload.signed_off_at,
            "package_snapshot": payload.package_snapshot,
            "model_snapshot": payload.model_snapshot,
            "event_history": payload.event_history,
            "created_at": payload.created_at,
            "updated_at": payload.updated_at,
        }
    return payload


def _review_list_item_from_queue(row: Any) -> dict[str, Any]:
    """Format a queue row for the review list."""
    return {
        "case_id": str(getattr(row, "case_id", row.get("case_id", ""))),
        "package_title": str(getattr(row, "package_title", row.get("package_title", ""))),
        "risk_label": str(getattr(row, "risk_label", row.get("risk_label", ""))),
        "risk_rank": int(getattr(row, "risk_rank", row.get("risk_rank", 0))),
    }


def _review_counts(items: list[Any]) -> dict[str, int]:
    """Count reviews by status."""
    counts: dict[str, int] = {}
    for item in items:
        status = str(getattr(item, "status", item.get("status", "Perlu Review")))
        counts[status] = counts.get(status, 0) + 1
    return counts

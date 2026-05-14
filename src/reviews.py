
"""SQLite review store for human decisions and signoff."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REVIEW_STATUSES = [
    "Perlu Review",
    "Sedang Direview",
    "Butuh Bukti Tambahan",
    "Ditandai Risiko",
    "Clear / Tidak Prioritas",
    "Selesai",
]
DEFAULT_REVIEW_STATUS = REVIEW_STATUSES[0]


def utc_now_iso() -> str:
    """Return timezone-aware ISO timestamp."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_dump(value: Any) -> str:
    """Serialize JSON with ensure_ascii=False and sort_keys=True."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _json_load(value: str | None, fallback: Any) -> Any:
    """Deserialize JSON safely; return fallback if empty or invalid."""
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return fallback


class ReviewStore:
    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        """Create connection, create parent dir, set row_factory, init schema once."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        if not self._initialized:
            self._init_schema(conn)
            self._initialized = True
        return conn

    def _init_schema(self, conn: sqlite3.Connection) -> None:
        """Initialize database schema with reviews and review_events tables."""
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reviews (
                case_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                reviewer_name TEXT,
                notes TEXT,
                decision_summary TEXT,
                package_snapshot TEXT,
                model_snapshot TEXT,
                prefill TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                signed_off_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS review_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT NOT NULL,
                status TEXT NOT NULL,
                reviewer_name TEXT,
                notes TEXT,
                decision_summary TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES reviews(case_id) ON DELETE CASCADE
            )
            """
        )
        conn.commit()

    def get_review(self, case_id: str) -> dict[str, Any] | None:
        """Return full saved record with history, or None."""
        conn = self._connect()
        try:
            cursor = conn.execute("SELECT * FROM reviews WHERE case_id = ?", (case_id,))
            review_row = cursor.fetchone()
            if not review_row:
                return None

            cursor = conn.execute(
                "SELECT * FROM review_events WHERE case_id = ? ORDER BY id ASC",
                (case_id,),
            )
            event_rows = cursor.fetchall()
            history = []
            for evt in event_rows:
                history.append({
                    "id": evt["id"],
                    "timestamp": evt["created_at"],
                    "status": evt["status"],
                    "reviewer_name": evt["reviewer_name"],
                    "notes": evt["notes"],
                    "decision_summary": evt["decision_summary"],
                })

            return {
                "case_id": review_row["case_id"],
                "status": review_row["status"],
                "reviewer_name": review_row["reviewer_name"],
                "notes": review_row["notes"],
                "decision_summary": review_row["decision_summary"],
                "package_snapshot": _json_load(review_row["package_snapshot"], None),
                "model_snapshot": _json_load(review_row["model_snapshot"], None),
                "prefill": _json_load(review_row["prefill"], None),
                "created_at": review_row["created_at"],
                "updated_at": review_row["updated_at"],
                "signed_off_at": review_row["signed_off_at"],
                "is_saved": True,
                "history": history,
            }
        finally:
            conn.close()

    def list_reviews(self) -> list[dict[str, Any]]:
        """Return saved reviews ordered by latest update (history omitted for performance)."""
        conn = self._connect()
        try:
            cursor = conn.execute("SELECT * FROM reviews ORDER BY updated_at DESC")
            rows = cursor.fetchall()
            return [
                {
                    "case_id": row["case_id"],
                    "status": row["status"],
                    "reviewer_name": row["reviewer_name"],
                    "notes": row["notes"],
                    "decision_summary": row["decision_summary"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "signed_off_at": row["signed_off_at"],
                    "is_saved": True,
                }
                for row in rows
            ]
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
        prefill: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Upsert review and append event to history."""
        if status not in REVIEW_STATUSES:
            raise ValueError(f"Status tidak valid: {status}. Pilih dari: {', '.join(REVIEW_STATUSES)}")

        now = utc_now_iso()
        existing = self.get_review(case_id)

        conn = self._connect()
        try:
            if existing:
                created_at = existing["created_at"]
                signed_off_at = existing["signed_off_at"]
            else:
                created_at = now
                signed_off_at = None

            if signed_off and not signed_off_at:
                signed_off_at = now

            package_snapshot_json = _json_dump(package_snapshot) if package_snapshot else None
            model_snapshot_json = _json_dump(model_snapshot) if model_snapshot else None
            prefill_json = _json_dump(prefill) if prefill else None

            conn.execute(
                """
                INSERT OR REPLACE INTO reviews (
                    case_id, status, reviewer_name, notes, decision_summary,
                    package_snapshot, model_snapshot, prefill, created_at, updated_at, signed_off_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    status,
                    reviewer_name,
                    notes,
                    decision_summary,
                    package_snapshot_json,
                    model_snapshot_json,
                    prefill_json,
                    created_at,
                    now,
                    signed_off_at,
                ),
            )

            conn.execute(
                """
                INSERT INTO review_events (
                    case_id, status, reviewer_name, notes, decision_summary, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (case_id, status, reviewer_name, notes, decision_summary, now),
            )
            conn.commit()
        finally:
            conn.close()

        return self.get_review(case_id)


def _draft_review(case_id: str, casebook_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Generate a draft review for a case that hasn't been saved yet."""
    return {
        "case_id": case_id,
        "status": DEFAULT_REVIEW_STATUS,
        "reviewer_name": None,
        "notes": None,
        "decision_summary": None,
        "package_snapshot": casebook_payload.get("metadata") if casebook_payload else None,
        "model_snapshot": casebook_payload.get("model_output") if casebook_payload else None,
        "prefill": None,
        "created_at": utc_now_iso(),
        "updated_at": utc_now_iso(),
        "signed_off_at": None,
        "is_saved": False,
        "history": [],
    }


def _review_snapshots(casebook_payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Extract package and model snapshots from casebook payload."""
    package_snapshot = casebook_payload.get("metadata", {})
    model_snapshot = casebook_payload.get("model_output", {})
    return package_snapshot, model_snapshot


def _review_record(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert review to a JSON-serializable dict (pass-through for dict)."""
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
    counts: dict[str, int] = {status: 0 for status in REVIEW_STATUSES}
    for item in items:
        status = str(getattr(item, "status", item.get("status", DEFAULT_REVIEW_STATUS)))
        if status in counts:
            counts[status] += 1
    return counts

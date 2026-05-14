"""Lightweight SQLite-backed human review store (Person 3 owns the full impl).

This file is a Person-2 placeholder so the FastAPI runtime has a working
review surface from day one. Person 3 is expected to expand it (richer
schema, migrations, list filtering, signed-off rules). Until then this
implementation already satisfies the API contract documented in
`docs/project-plans/backend/integration-contracts.md`:

- saved review can be looked up by `case_id`
- save appends an event to history
- `signed_off=True` records `signed_off_at`
- list returns every saved review with stable status counts

The store performs no scraping, no model retraining, no parquet writes; it
only serializes JSON snapshots into SQLite.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


REVIEW_STATUSES: List[str] = [
    "Perlu Review",
    "Sedang Direview",
    "Butuh Bukti Tambahan",
    "Ditandai Risiko",
    "Clear / Tidak Prioritas",
    "Selesai",
]
DEFAULT_REVIEW_STATUS = REVIEW_STATUSES[0]


def utc_now_iso() -> str:
    """Return a timezone-aware ISO-8601 timestamp truncated to seconds."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _json_load(value: Any, fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


class ReviewStore:
    """Tiny SQLite-backed review store keyed by `case_id`."""

    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._initialized = False

    # -- connection -----------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        if not self._initialized:
            self._init_schema(conn)
            self._initialized = True
        return conn

    @staticmethod
    def _init_schema(conn: sqlite3.Connection) -> None:
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
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()

    # -- read -----------------------------------------------------------

    def get_review(self, case_id: str) -> Optional[Dict[str, Any]]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM reviews WHERE case_id = ?", (case_id,)
            ).fetchone()
            if row is None:
                return None
            history = [
                dict(event)
                for event in conn.execute(
                    "SELECT * FROM review_events WHERE case_id = ? ORDER BY id ASC",
                    (case_id,),
                ).fetchall()
            ]
        finally:
            conn.close()
        return self._row_to_record(row, history)

    def list_reviews(self) -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM reviews ORDER BY datetime(updated_at) DESC"
            ).fetchall()
        finally:
            conn.close()
        # History omitted from list view to keep payload small; UI fetches
        # full record via /api/reviews/{case_id} when the user opens a row.
        return [self._row_to_record(row, history=[]) for row in rows]

    # -- write ----------------------------------------------------------

    def upsert_review(
        self,
        case_id: str,
        *,
        status: str,
        reviewer_name: Optional[str],
        notes: Optional[str],
        decision_summary: Optional[str],
        package_snapshot: Optional[Dict[str, Any]] = None,
        model_snapshot: Optional[Dict[str, Any]] = None,
        prefill: Optional[Dict[str, Any]] = None,
        signed_off: bool = False,
    ) -> Dict[str, Any]:
        if status not in REVIEW_STATUSES:
            raise ValueError(f"Unknown review status: {status!r}")

        now = utc_now_iso()
        conn = self._connect()
        try:
            existing = conn.execute(
                "SELECT created_at, package_snapshot, model_snapshot, prefill, signed_off_at "
                "FROM reviews WHERE case_id = ?",
                (case_id,),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            package_payload = (
                _json_dump(package_snapshot)
                if package_snapshot is not None
                else (existing["package_snapshot"] if existing else _json_dump({}))
            )
            model_payload = (
                _json_dump(model_snapshot)
                if model_snapshot is not None
                else (existing["model_snapshot"] if existing else _json_dump({}))
            )
            prefill_payload = (
                _json_dump(prefill)
                if prefill is not None
                else (existing["prefill"] if existing else _json_dump({}))
            )
            new_signed_off_at: Optional[str]
            if signed_off or status == "Selesai":
                new_signed_off_at = (existing["signed_off_at"] if existing and existing["signed_off_at"] else now)
            else:
                new_signed_off_at = existing["signed_off_at"] if existing else None

            conn.execute(
                """
                INSERT INTO reviews (
                    case_id, status, reviewer_name, notes, decision_summary,
                    package_snapshot, model_snapshot, prefill,
                    created_at, updated_at, signed_off_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(case_id) DO UPDATE SET
                    status = excluded.status,
                    reviewer_name = excluded.reviewer_name,
                    notes = excluded.notes,
                    decision_summary = excluded.decision_summary,
                    package_snapshot = excluded.package_snapshot,
                    model_snapshot = excluded.model_snapshot,
                    prefill = excluded.prefill,
                    updated_at = excluded.updated_at,
                    signed_off_at = excluded.signed_off_at
                """,
                (
                    case_id,
                    status,
                    reviewer_name,
                    notes,
                    decision_summary,
                    package_payload,
                    model_payload,
                    prefill_payload,
                    created_at,
                    now,
                    new_signed_off_at,
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

        record = self.get_review(case_id)
        # get_review just wrote the row; it cannot return None here.
        assert record is not None  # nosec - sanity guard
        return record

    # -- helpers --------------------------------------------------------

    @staticmethod
    def _row_to_record(row: sqlite3.Row, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "case_id": row["case_id"],
            "status": row["status"],
            "reviewer_name": row["reviewer_name"],
            "notes": row["notes"],
            "decision_summary": row["decision_summary"],
            "package_snapshot": _json_load(row["package_snapshot"], {}),
            "model_snapshot": _json_load(row["model_snapshot"], {}),
            "prefill": _json_load(row["prefill"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "signed_off_at": row["signed_off_at"],
            "is_saved": True,
            "event_count": len(history),
            "history": history,
        }

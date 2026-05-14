"""SQLite-backed human review store for LPSE-X package reviews."""

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
    return datetime.now(timezone.utc).isoformat()


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _json_load(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


class ReviewStore:
    """Small SQLite repository for local review decisions and event history."""

    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        if not self._initialized:
            self._init_schema(conn)
            self._initialized = True
        return conn

    def _init_schema(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reviews (
                case_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                reviewer_name TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                decision_summary TEXT NOT NULL DEFAULT '',
                package_snapshot TEXT NOT NULL,
                model_snapshot TEXT NOT NULL,
                prefill TEXT NOT NULL,
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
                reviewer_name TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                decision_summary TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(case_id) REFERENCES reviews(case_id)
            )
            """
        )
        conn.commit()

    def get_review(self, case_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM reviews WHERE case_id = ?", (case_id,)).fetchone()
            if row is None:
                return None
            return self._row_to_review(conn, row)

    def list_reviews(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM reviews ORDER BY updated_at DESC, created_at DESC").fetchall()
            return [self._row_to_review(conn, row, include_history=False) for row in rows]

    def upsert_review(
        self,
        *,
        case_id: str,
        status: str,
        reviewer_name: str,
        notes: str,
        decision_summary: str,
        signed_off: bool,
        package_snapshot: dict[str, Any],
        model_snapshot: dict[str, Any],
        prefill: dict[str, Any],
    ) -> dict[str, Any]:
        now = utc_now_iso()
        existing = self.get_review(case_id)
        signed_off_at = now if signed_off else (existing or {}).get("signed_off_at")
        created_at = (existing or {}).get("created_at", now)
        with self._connect() as conn:
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
                    _json_dump(package_snapshot),
                    _json_dump(model_snapshot),
                    _json_dump(prefill),
                    created_at,
                    now,
                    signed_off_at,
                ),
            )
            conn.execute(
                """
                INSERT INTO review_events (case_id, status, reviewer_name, notes, decision_summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (case_id, status, reviewer_name, notes, decision_summary, now),
            )
            conn.commit()
        saved = self.get_review(case_id)
        if saved is None:  # pragma: no cover - defensive only
            raise RuntimeError(f"Review was not saved for case_id={case_id}")
        return saved

    def _row_to_review(self, conn: sqlite3.Connection, row: sqlite3.Row, include_history: bool = True) -> dict[str, Any]:
        event_count = conn.execute("SELECT COUNT(*) FROM review_events WHERE case_id = ?", (row["case_id"],)).fetchone()[0]
        history: list[dict[str, Any]] = []
        if include_history:
            history_rows = conn.execute(
                "SELECT status, reviewer_name, notes, decision_summary, created_at FROM review_events WHERE case_id = ? ORDER BY id DESC",
                (row["case_id"],),
            ).fetchall()
            history = [dict(history_row) for history_row in history_rows]
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
            "event_count": int(event_count),
            "history": history,
        }

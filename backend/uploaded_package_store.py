"""SQLite persistence for locally uploaded tender package scoring runs."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


class UploadedPackageStore:
    """SQLite repository for uploaded CSV inference runs and scored rows."""

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
            CREATE TABLE IF NOT EXISTS upload_runs (
                upload_id TEXT PRIMARY KEY,
                rows_received INTEGER NOT NULL,
                rows_scored INTEGER NOT NULL,
                rows_ranked INTEGER NOT NULL,
                source_split TEXT NOT NULL,
                eval_claim_scope TEXT NOT NULL,
                model_artifact TEXT NOT NULL,
                model_backend TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                warnings_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS uploaded_tender_rows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                upload_rank INTEGER NOT NULL,
                row_id INTEGER,
                package_title TEXT NOT NULL,
                buyer TEXT NOT NULL,
                supplier TEXT NOT NULL,
                predicted_label TEXT NOT NULL,
                risk_priority_score REAL,
                tender_value REAL,
                source_split TEXT NOT NULL,
                eval_claim_scope TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(upload_id) REFERENCES upload_runs(upload_id)
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_uploaded_rows_upload_id ON uploaded_tender_rows(upload_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_uploaded_rows_case_id ON uploaded_tender_rows(case_id)")
        conn.commit()

    def save_upload_result(self, result: Any) -> int:
        """Persist one scoring run and all returned scored rows."""

        metadata = result.metadata
        metadata_json = asdict(metadata)
        created_at = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO upload_runs (
                    upload_id, rows_received, rows_scored, rows_ranked,
                    source_split, eval_claim_scope, model_artifact, model_backend,
                    metadata_json, warnings_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(upload_id) DO UPDATE SET
                    rows_received = excluded.rows_received,
                    rows_scored = excluded.rows_scored,
                    rows_ranked = excluded.rows_ranked,
                    source_split = excluded.source_split,
                    eval_claim_scope = excluded.eval_claim_scope,
                    model_artifact = excluded.model_artifact,
                    model_backend = excluded.model_backend,
                    metadata_json = excluded.metadata_json,
                    warnings_json = excluded.warnings_json
                """,
                (
                    metadata.upload_id,
                    metadata.rows_received,
                    metadata.rows_scored,
                    metadata.rows_ranked,
                    metadata.source_split,
                    metadata.eval_claim_scope,
                    metadata.model_artifact,
                    metadata.model_backend,
                    _json_dump(metadata_json),
                    _json_dump(result.warnings),
                    created_at,
                ),
            )
            conn.execute("DELETE FROM uploaded_tender_rows WHERE upload_id = ?", (metadata.upload_id,))
            conn.executemany(
                """
                INSERT INTO uploaded_tender_rows (
                    upload_id, case_id, upload_rank, row_id, package_title, buyer, supplier,
                    predicted_label, risk_priority_score, tender_value, source_split,
                    eval_claim_scope, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        metadata.upload_id,
                        str(item.get("case_id") or ""),
                        int(item.get("upload_rank") or 0),
                        _optional_int(item.get("row_id")),
                        str(item.get("package_title") or ""),
                        str(item.get("buyer") or ""),
                        str(item.get("supplier") or ""),
                        str(item.get("predicted_label") or ""),
                        _optional_float(item.get("risk_priority_score")),
                        _optional_float(item.get("tender_value")),
                        str(item.get("source_split") or metadata.source_split),
                        str(item.get("eval_claim_scope") or metadata.eval_claim_scope),
                        _json_dump(item),
                        created_at,
                    )
                    for item in result.items
                ],
            )
            conn.commit()
        return len(result.items)

    def get_upload_run(self, upload_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM upload_runs WHERE upload_id = ?", (upload_id,)).fetchone()
            if row is None:
                return None
            return self._run_row_to_dict(row)

    def list_uploaded_rows(self, upload_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        query = "SELECT * FROM uploaded_tender_rows"
        params: tuple[Any, ...]
        if upload_id:
            query += " WHERE upload_id = ?"
            params = (upload_id, limit)
        else:
            params = (limit,)
        query += " ORDER BY id DESC, upload_rank ASC LIMIT ?"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def _run_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "upload_id": row["upload_id"],
            "rows_received": int(row["rows_received"]),
            "rows_scored": int(row["rows_scored"]),
            "rows_ranked": int(row["rows_ranked"]),
            "source_split": row["source_split"],
            "eval_claim_scope": row["eval_claim_scope"],
            "model_artifact": row["model_artifact"],
            "model_backend": row["model_backend"],
            "metadata": _json_load(row["metadata_json"], {}),
            "warnings": _json_load(row["warnings_json"], []),
            "created_at": row["created_at"],
        }

    def _row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "upload_id": row["upload_id"],
            "case_id": row["case_id"],
            "upload_rank": int(row["upload_rank"]),
            "row_id": row["row_id"],
            "package_title": row["package_title"],
            "buyer": row["buyer"],
            "supplier": row["supplier"],
            "predicted_label": row["predicted_label"],
            "risk_priority_score": row["risk_priority_score"],
            "tender_value": row["tender_value"],
            "source_split": row["source_split"],
            "eval_claim_scope": row["eval_claim_scope"],
            "payload": _json_load(row["payload_json"], {}),
            "created_at": row["created_at"],
        }


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

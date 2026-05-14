"""Normalize KPK PPID report rows into the common evidence schema."""

from __future__ import annotations

from typing import Any

SOURCE_NAME = "kpk_ppid_report"
SOURCE_TYPE = "ppid_activity_report"
ORGANIZATION = "Komisi Pemberantasan Korupsi (KPK) / PPID"


def _first_nonempty(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _normalize_case_stage(*values: Any) -> str:
    raw = _first_nonempty(*values)
    if raw is None:
        return "ongoing_case"

    normalized = raw.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {
        "final_outcome",
        "execution",
        "prosecution",
        "investigation",
        "ongoing_case",
        "human_review",
        "candidate_queue",
    }:
        return normalized
    if any(token in normalized for token in {"putusan", "terpidana", "vonis", "convict", "final"}):
        return "final_outcome"
    if any(token in normalized for token in {"eksekusi", "execution"}):
        return "execution"
    if any(token in normalized for token in {"dakwan", "tuntut", "prosecution"}):
        return "prosecution"
    if any(token in normalized for token in {"penyidik", "sprin", "investig"}):
        return "investigation"
    if any(token in normalized for token in {"review", "manual"}):
        return "human_review"
    if any(token in normalized for token in {"candidate", "queue"}):
        return "candidate_queue"
    return "ongoing_case"


def _default_label_family(case_stage: str | None) -> str:
    if case_stage in {"final_outcome", "execution"}:
        return "confirmed_fraud"
    if case_stage in {"human_review", "candidate_queue"}:
        return "reviewed_risk"
    return "reviewed_risk"


def _default_label_value(case_stage: str | None) -> str:
    mapping = {
        "final_outcome": "kpk_ppid_final_outcome",
        "execution": "kpk_ppid_execution",
        "prosecution": "kpk_ppid_prosecution",
        "investigation": "kpk_ppid_investigation",
        "human_review": "kpk_ppid_human_review",
        "candidate_queue": "kpk_ppid_candidate_review",
    }
    return mapping.get(case_stage or "", "kpk_ppid_report")


def _compose_provenance_note(record: dict[str, Any]) -> str:
    fragments = [
        record.get("report_title"),
        f"document_id={record.get('document_id')}" if record.get("document_id") else None,
        f"decision_number={record.get('decision_number')}" if record.get("decision_number") else None,
        f"excerpt={record.get('excerpt')}" if record.get("excerpt") else None,
    ]
    return " | ".join(str(fragment).strip() for fragment in fragments if fragment)


def transform_kpk_ppid_report_record(record: dict[str, Any]) -> dict[str, Any]:
    case_stage = _normalize_case_stage(record.get("case_stage"), record.get("status"), record.get("record_type"))
    return {
        "source_record_id": _first_nonempty(record.get("source_record_id"), record.get("record_id"), record.get("document_id"), record.get("title")),
        "source_name": SOURCE_NAME,
        "source_type": SOURCE_TYPE,
        "source_url": _first_nonempty(record.get("source_url"), record.get("url"), record.get("document_url")),
        "title": _first_nonempty(record.get("title"), record.get("report_title"), record.get("document_title")),
        "organization": _first_nonempty(record.get("organization"), ORGANIZATION),
        "label_family": _first_nonempty(record.get("label_family"), _default_label_family(case_stage)),
        "label_value": _first_nonempty(record.get("label_value"), _default_label_value(case_stage)),
        "evidence_strength": _first_nonempty(record.get("evidence_strength"), "high" if case_stage in {"final_outcome", "execution"} else "medium"),
        "case_stage": case_stage,
        "decision_date": _first_nonempty(record.get("decision_date"), record.get("final_outcome_date")),
        "publication_date": _first_nonempty(record.get("publication_date"), record.get("report_date")),
        "supplier_name": _first_nonempty(record.get("supplier_name"), record.get("vendor_name"), record.get("company_name")),
        "supplier_id": _first_nonempty(record.get("supplier_id"), record.get("npwp"), record.get("nib")),
        "buyer_name": _first_nonempty(record.get("buyer_name"), record.get("agency_name"), record.get("instansi")),
        "buyer_id": _first_nonempty(record.get("buyer_id"), record.get("agency_id")),
        "matched_ocid": _first_nonempty(record.get("matched_ocid"), record.get("ocid")),
        "match_confidence": record.get("match_confidence"),
        "provenance_note": _first_nonempty(record.get("provenance_note"), _compose_provenance_note(record)),
        "package_name": _first_nonempty(record.get("package_name"), record.get("project_name")),
        "package_id": _first_nonempty(record.get("package_id"), record.get("tender_id"), record.get("rup_id")),
        "package_value_amount": record.get("package_value_amount"),
        "package_year": _first_nonempty(record.get("package_year"), record.get("case_year"), record.get("year")),
        "procurement_category": _first_nonempty(record.get("procurement_category"), record.get("jenis_pengadaan")),
    }


def transform_kpk_ppid_report_records(records: list[dict]) -> list[dict]:
    return [transform_kpk_ppid_report_record(record) for record in records]
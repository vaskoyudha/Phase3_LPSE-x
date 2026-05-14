"""Normalize KPK procurement case pages / press-release rows into common evidence schema."""

from __future__ import annotations

from typing import Any

SOURCE_NAME = "kpk_procurement_case"
SOURCE_TYPE = "case_press_release"
ORGANIZATION = "Komisi Pemberantasan Korupsi (KPK)"


def _first_nonempty(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _default_label_family(case_stage: str | None) -> str:
    if case_stage == "final_outcome":
        return "confirmed_fraud"
    if case_stage == "administrative_sanction":
        return "confirmed_irregularity"
    if case_stage == "human_review":
        return "reviewed_risk"
    if case_stage == "candidate_queue":
        return "candidate_review_queue"
    return "reviewed_risk"


def _normalize_case_stage(*values: Any) -> str:
    raw = _first_nonempty(*values)
    if raw is None:
        return "ongoing_case"

    normalized = raw.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {
        "final_outcome",
        "audit_finding",
        "administrative_sanction",
        "human_review",
        "candidate_queue",
        "ongoing_case",
        "unknown",
    }:
        return normalized
    if "finish" in normalized or "putusan" in normalized or "vonis" in normalized:
        return "final_outcome"
    if "audit" in normalized:
        return "audit_finding"
    if "review" in normalized:
        return "human_review"
    if "candidate" in normalized or "queue" in normalized:
        return "candidate_queue"
    if "sanction" in normalized or "sanksi" in normalized:
        return "administrative_sanction"
    return "ongoing_case"


def _default_label_value(case_stage: str | None) -> str:
    mapping = {
        "final_outcome": "kpk_final_outcome",
        "administrative_sanction": "kpk_administrative_sanction",
        "human_review": "kpk_human_review",
        "candidate_queue": "kpk_candidate_review",
        "ongoing_case": "kpk_ongoing_case",
    }
    return mapping.get(case_stage or "", "kpk_procurement_case")


def _compose_provenance_note(record: dict[str, Any]) -> str:
    fragments = [
        record.get("case_summary"),
        f"suspect_names={record.get('suspect_names')}" if record.get("suspect_names") else None,
        f"package_names={record.get('package_name')}" if record.get("package_name") else None,
    ]
    return " | ".join(str(fragment).strip() for fragment in fragments if fragment)


def transform_kpk_procurement_case_record(record: dict[str, Any]) -> dict[str, Any]:
    case_stage = _normalize_case_stage(record.get("case_stage"), record.get("status"), record.get("page_status"))
    return {
        "source_record_id": _first_nonempty(record.get("source_record_id"), record.get("case_id"), record.get("slug"), record.get("title")),
        "source_name": SOURCE_NAME,
        "source_type": SOURCE_TYPE,
        "source_url": _first_nonempty(record.get("source_url"), record.get("url")),
        "title": _first_nonempty(record.get("title"), record.get("case_title")),
        "organization": _first_nonempty(record.get("organization"), ORGANIZATION),
        "label_family": _first_nonempty(record.get("label_family"), _default_label_family(case_stage)),
        "label_value": _first_nonempty(record.get("label_value"), _default_label_value(case_stage)),
        "evidence_strength": _first_nonempty(record.get("evidence_strength"), "high" if case_stage == "final_outcome" else "medium"),
        "case_stage": case_stage,
        "decision_date": _first_nonempty(record.get("decision_date"), record.get("final_outcome_date")),
        "publication_date": _first_nonempty(record.get("publication_date"), record.get("published_at")),
        "supplier_name": _first_nonempty(record.get("supplier_name"), record.get("vendor_name"), record.get("company_name")),
        "supplier_id": _first_nonempty(record.get("supplier_id"), record.get("npwp"), record.get("nib")),
        "buyer_name": _first_nonempty(record.get("buyer_name"), record.get("agency_name"), record.get("instansi")),
        "buyer_id": _first_nonempty(record.get("buyer_id"), record.get("agency_id")),
        "matched_ocid": _first_nonempty(record.get("matched_ocid"), record.get("ocid")),
        "match_confidence": record.get("match_confidence"),
        "provenance_note": _first_nonempty(record.get("provenance_note"), _compose_provenance_note(record)),
        "package_name": _first_nonempty(record.get("package_name"), record.get("project_name")),
        "package_id": _first_nonempty(record.get("package_id"), record.get("rup_id"), record.get("tender_id")),
        "package_value_amount": record.get("package_value_amount"),
        "package_year": _first_nonempty(record.get("package_year"), record.get("case_year"), record.get("year")),
        "procurement_category": _first_nonempty(record.get("procurement_category"), record.get("jenis_pengadaan")),
    }


def transform_kpk_procurement_case_records(records: list[dict]) -> list[dict]:
    return [transform_kpk_procurement_case_record(record) for record in records]

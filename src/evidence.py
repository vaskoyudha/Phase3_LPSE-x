"""Evidence and label normalization helpers for fraud/evidence workflows.

These helpers keep the evidence lane separate from the heuristic-risk model.
They normalize official-source evidence records and convert them into
provenance-rich label records that can later be linked back to procurement rows.
"""

from __future__ import annotations

import re
from typing import Any

import pandas as pd

VALID_LABEL_FAMILIES = {
    "confirmed_fraud",
    "confirmed_irregularity",
    "sanctioned_supplier",
    "reviewed_risk",
    "candidate_review_queue",
    "unlabeled",
}

VALID_SOURCE_TYPES = {
    "court_decision",
    "sanction_list",
    "audit_report",
    "case_press_release",
    "ppid_activity_report",
    "procurement_portal",
    "company_registry",
    "complaint_system",
    "other",
}

VALID_CASE_STAGES = {
    "final_outcome",
    "audit_finding",
    "administrative_sanction",
    "human_review",
    "candidate_queue",
    "ongoing_case",
    "unknown",
}


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None



def _clean_date(value: Any) -> str | None:
    text = _clean_text(value)
    if text is None:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return text
    return parsed.date().isoformat()



def _clean_score(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return min(1.0, max(0.0, numeric))


def _normalize_numeric_text(value: Any) -> str | None:
    text = _clean_text(value)
    if text is None:
        return None

    cleaned = re.sub(r"[^0-9,.-]+", "", text)
    if not cleaned:
        return None

    negative = cleaned.startswith("-")
    cleaned = cleaned.lstrip("-")
    if not cleaned:
        return None

    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")
    elif cleaned.count(",") > 1:
        cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        whole, fractional = cleaned.split(",", 1)
        if fractional.isdigit() and len(fractional) in {1, 2}:
            cleaned = f"{whole}.{fractional}"
        elif fractional.isdigit() and len(fractional) == 3:
            cleaned = f"{whole}{fractional}"
        else:
            cleaned = cleaned.replace(",", "")
    elif "." in cleaned:
        whole, fractional = cleaned.split(".", 1)
        if fractional.isdigit() and len(fractional) == 3:
            cleaned = f"{whole}{fractional}"

    return f"-{cleaned}" if negative else cleaned


def _clean_numeric(value: Any) -> float | None:
    normalized = _normalize_numeric_text(value)
    if normalized is None:
        return None
    try:
        return float(normalized)
    except (TypeError, ValueError):
        return None



def normalize_evidence_record(record: dict[str, Any]) -> dict[str, Any]:
    """Normalize a source evidence record into a stable schema."""
    label_family = _clean_text(record.get("label_family")) or "unlabeled"
    if label_family not in VALID_LABEL_FAMILIES:
        raise ValueError(f"Unsupported label_family: {label_family}")

    source_type = _clean_text(record.get("source_type")) or "other"
    if source_type not in VALID_SOURCE_TYPES:
        raise ValueError(f"Unsupported source_type: {source_type}")

    case_stage = _clean_text(record.get("case_stage")) or "unknown"
    if case_stage not in VALID_CASE_STAGES:
        raise ValueError(f"Unsupported case_stage: {case_stage}")

    source_record_id = _clean_text(record.get("source_record_id"))
    if source_record_id is None:
        raise ValueError("source_record_id is required")

    source_name = _clean_text(record.get("source_name"))
    if source_name is None:
        raise ValueError("source_name is required")

    return {
        "source_record_id": source_record_id,
        "source_name": source_name,
        "source_type": source_type,
        "source_url": _clean_text(record.get("source_url") or record.get("url")),
        "title": _clean_text(record.get("title")),
        "organization": _clean_text(record.get("organization")),
        "label_family": label_family,
        "label_value": _clean_text(record.get("label_value")) or "unknown",
        "evidence_strength": _clean_text(record.get("evidence_strength")) or "medium",
        "case_stage": case_stage,
        "decision_date": _clean_date(record.get("decision_date")),
        "publication_date": _clean_date(record.get("publication_date")),
        "supplier_name": _clean_text(record.get("supplier_name")),
        "supplier_id": _clean_text(record.get("supplier_id")),
        "buyer_name": _clean_text(record.get("buyer_name")),
        "buyer_id": _clean_text(record.get("buyer_id")),
        "package_name": _clean_text(record.get("package_name")),
        "package_id": _clean_text(record.get("package_id")),
        "package_value_amount": _clean_numeric(record.get("package_value_amount")),
        "package_year": _clean_text(record.get("package_year")),
        "procurement_category": _clean_text(record.get("procurement_category")),
        "sanction_end_date": _clean_date(record.get("sanction_end_date")),
        "matched_ocid": _clean_text(record.get("matched_ocid") or record.get("ocid")),
        "match_confidence": _clean_score(record.get("match_confidence")),
        "raw_file_path": _clean_text(record.get("raw_file_path")),
        "access_date": _clean_date(record.get("access_date")),
        "imported_at": _clean_text(record.get("imported_at")),
        "provenance_note": _clean_text(record.get("provenance_note")),
    }



def evidence_to_label_record(
    evidence_record: dict[str, Any],
    *,
    ocid: str | None,
    confidence_score: float | None = None,
    reviewer_needed: bool = False,
) -> dict[str, Any]:
    """Convert a normalized evidence record into a label record."""
    evidence = normalize_evidence_record(evidence_record)
    return {
        "ocid": _clean_text(ocid) or evidence.get("matched_ocid"),
        "label_family": evidence["label_family"],
        "label_value": evidence["label_value"],
        "evidence_strength": evidence["evidence_strength"],
        "case_stage": evidence["case_stage"],
        "source_type": evidence["source_type"],
        "source_name": evidence["source_name"],
        "source_record_id": evidence["source_record_id"],
        "source_url": evidence["source_url"],
        "decision_date": evidence["decision_date"],
        "confidence_score": _clean_score(confidence_score),
        "reviewer_needed": bool(reviewer_needed),
        "supplier_name": evidence.get("supplier_name"),
        "buyer_name": evidence.get("buyer_name"),
        "package_name": evidence.get("package_name"),
        "provenance_note": evidence.get("provenance_note"),
    }

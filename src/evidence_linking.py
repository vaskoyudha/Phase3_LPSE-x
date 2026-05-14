"""Entity-resolution helpers for linking official evidence rows back to procurement records."""

from __future__ import annotations

import re
from typing import Any

import pandas as pd

CORPORATE_STOPWORDS = {
    "PT",
    "CV",
    "TBK",
    "PERSERO",
    "PERSERODA",
    "UD",
    "PD",
    "CO",
    "LTD",
}

TITLE_STOPWORDS = {
    "PENGADAAN",
    "PEKERJAAN",
    "PAKET",
    "UNTUK",
    "DAN",
    "DI",
    "TAHUN",
}

MATCH_COLUMNS = [
    "source_record_id",
    "source_name",
    "label_family",
    "ocid",
    "match_type",
    "match_confidence",
    "matched_on",
    "reviewer_needed",
    "matched_supplier_name",
    "matched_buyer_name",
    "matched_tender_title",
]

TIE_SCORE_EPSILON = 1e-9


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_identifier(value: Any) -> str:
    text = _clean_text(value).upper()
    return re.sub(r"[^A-Z0-9]+", "", text)


def normalize_entity_name(value: Any) -> str:
    text = _clean_text(value).upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    tokens = [token for token in text.split() if token and token not in CORPORATE_STOPWORDS]
    return "".join(tokens)


def normalize_title_tokens(value: Any) -> set[str]:
    text = _clean_text(value).upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return {token for token in text.split() if token and token not in TITLE_STOPWORDS}


def _token_jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    intersection = len(left & right)
    union = len(left | right)
    if union == 0:
        return 0.0
    return intersection / union


def _safe_year(value: Any) -> int | None:
    text = _clean_text(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        digits = re.findall(r"\d{4}", text)
        if digits:
            return int(digits[0])
        return None
    return int(parsed.year)


def _series_to_year(series: pd.Series) -> pd.Series:
    text = series.fillna("").map(_clean_text)
    parsed_years = pd.to_datetime(text, errors="coerce").dt.year.astype("Int64")
    missing = parsed_years.isna() & text.ne("")
    if missing.any():
        extracted = text[missing].str.extract(r"(\d{4})", expand=False)
        parsed_years.loc[missing] = pd.to_numeric(extracted, errors="coerce").astype("Int64")
    return parsed_years


def _safe_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _series_or_default(df: pd.DataFrame, column: str, default: Any = "") -> pd.Series:
    if column in df.columns:
        return df[column]
    return pd.Series([default] * len(df), index=df.index)


def _prep_procurement(procurement_df: pd.DataFrame) -> pd.DataFrame:
    procurement = procurement_df.copy()
    procurement["_supplier_id_norm"] = _series_or_default(procurement, "supplier_id").map(normalize_identifier)
    procurement["_buyer_id_norm"] = _series_or_default(procurement, "buyer_id").map(normalize_identifier)
    procurement["_supplier_norm"] = _series_or_default(procurement, "supplier_name").map(normalize_entity_name)
    procurement["_buyer_norm"] = _series_or_default(procurement, "buyer_name").map(normalize_entity_name)
    procurement["_title_tokens"] = _series_or_default(procurement, "tender_title").map(normalize_title_tokens)
    procurement["_tender_year"] = _series_to_year(_series_or_default(procurement, "tender_datePublished"))
    procurement["_value_amount"] = _series_or_default(procurement, "award_value_amount", None).combine_first(
        _series_or_default(procurement, "tender_value_amount", None)
    )
    return procurement


def _prep_evidence(evidence_df: pd.DataFrame) -> pd.DataFrame:
    evidence = evidence_df.copy()
    evidence["_supplier_id_norm"] = _series_or_default(evidence, "supplier_id").map(normalize_identifier)
    evidence["_buyer_id_norm"] = _series_or_default(evidence, "buyer_id").map(normalize_identifier)
    evidence["_supplier_norm"] = _series_or_default(evidence, "supplier_name").map(normalize_entity_name)
    evidence["_buyer_norm"] = _series_or_default(evidence, "buyer_name").map(normalize_entity_name)
    package_or_title = _series_or_default(evidence, "package_name").replace("", pd.NA).combine_first(
        _series_or_default(evidence, "title")
    )
    evidence["_title_tokens"] = package_or_title.fillna("").map(normalize_title_tokens)
    package_or_date = _series_or_default(evidence, "package_year").replace("", pd.NA).combine_first(
        _series_or_default(evidence, "decision_date").replace("", pd.NA)
    ).combine_first(_series_or_default(evidence, "publication_date"))
    evidence["_package_year"] = _series_to_year(package_or_date)
    evidence["_value_amount"] = _series_or_default(evidence, "package_value_amount", None).map(_safe_float)
    return evidence


def _build_value_lookup(procurement: pd.DataFrame, column: str) -> dict[str, set[int]]:
    lookup: dict[str, set[int]] = {}
    for index, value in procurement[column].items():
        if not value:
            continue
        lookup.setdefault(str(value), set()).add(index)
    return lookup


def _build_title_lookup(procurement: pd.DataFrame) -> dict[str, set[int]]:
    lookup: dict[str, set[int]] = {}
    for index, tokens in procurement["_title_tokens"].items():
        for token in tokens:
            lookup.setdefault(token, set()).add(index)
    return lookup


def _build_procurement_indexes(procurement: pd.DataFrame) -> dict[str, dict[str, set[int]]]:
    return {
        "supplier_id": _build_value_lookup(procurement, "_supplier_id_norm"),
        "buyer_id": _build_value_lookup(procurement, "_buyer_id_norm"),
        "supplier_name": _build_value_lookup(procurement, "_supplier_norm"),
        "buyer_name": _build_value_lookup(procurement, "_buyer_norm"),
        "title_tokens": _build_title_lookup(procurement),
    }


def _title_overlap_candidates(
    title_lookup: dict[str, set[int]],
    title_tokens: set[str],
    *,
    min_overlap: int,
) -> set[int]:
    overlap_counts: dict[int, int] = {}
    for token in title_tokens:
        for index in title_lookup.get(token, set()):
            overlap_counts[index] = overlap_counts.get(index, 0) + 1
    return {index for index, count in overlap_counts.items() if count >= min_overlap}


def _candidate_indices(
    procurement_indexes: dict[str, dict[str, set[int]]],
    evidence_row: pd.Series,
    *,
    min_title_overlap: int = 2,
) -> set[int]:
    indices: set[int] = set()

    supplier_id_norm = evidence_row.get("_supplier_id_norm", "")
    buyer_id_norm = evidence_row.get("_buyer_id_norm", "")
    supplier_norm = evidence_row.get("_supplier_norm", "")
    buyer_norm = evidence_row.get("_buyer_norm", "")
    title_tokens = evidence_row.get("_title_tokens", set())

    if supplier_id_norm:
        indices.update(procurement_indexes["supplier_id"].get(str(supplier_id_norm), set()))
    if buyer_id_norm:
        indices.update(procurement_indexes["buyer_id"].get(str(buyer_id_norm), set()))
    if supplier_norm:
        indices.update(procurement_indexes["supplier_name"].get(str(supplier_norm), set()))
    if buyer_norm:
        indices.update(procurement_indexes["buyer_name"].get(str(buyer_norm), set()))
    if title_tokens:
        indices.update(
            _title_overlap_candidates(
                procurement_indexes["title_tokens"],
                title_tokens,
                min_overlap=min_title_overlap,
            )
        )
    return indices


def _max_score_without_strong_candidates(evidence_row: pd.Series) -> float:
    score = 0.0
    if evidence_row.get("_title_tokens", set()):
        score += 0.25
    if pd.notna(evidence_row.get("_package_year")):
        score += 0.10
    if pd.notna(evidence_row.get("_value_amount")):
        score += 0.10
    return score


def _unmatched_row(evidence_row: pd.Series, *, confidence: float = 0.0, matched_on: str = "") -> dict[str, Any]:
    return {
        "source_record_id": evidence_row.get("source_record_id"),
        "source_name": evidence_row.get("source_name"),
        "label_family": evidence_row.get("label_family"),
        "ocid": None,
        "match_type": "unmatched",
        "match_confidence": round(max(float(confidence), 0.0), 4),
        "matched_on": matched_on,
        "reviewer_needed": True,
        "matched_supplier_name": None,
        "matched_buyer_name": None,
        "matched_tender_title": None,
    }


def _ambiguous_match_row(
    evidence_row: pd.Series,
    *,
    score: float,
    signals: list[str],
) -> dict[str, Any]:
    matched_on = "|".join([*signals, "ambiguous_best_match"])
    return {
        "source_record_id": evidence_row.get("source_record_id"),
        "source_name": evidence_row.get("source_name"),
        "label_family": evidence_row.get("label_family"),
        "ocid": None,
        "match_type": "ambiguous_best_match",
        "match_confidence": round(float(score), 4),
        "matched_on": matched_on,
        "reviewer_needed": True,
        "matched_supplier_name": None,
        "matched_buyer_name": None,
        "matched_tender_title": None,
    }


def _score_match(procurement_row: pd.Series, evidence_row: pd.Series) -> tuple[float, list[str]]:
    score = 0.0
    signals: list[str] = []

    supplier_id_norm = evidence_row.get("_supplier_id_norm", "")
    buyer_id_norm = evidence_row.get("_buyer_id_norm", "")
    supplier_norm = evidence_row.get("_supplier_norm", "")
    buyer_norm = evidence_row.get("_buyer_norm", "")
    title_tokens = evidence_row.get("_title_tokens", set())

    if supplier_id_norm and procurement_row.get("_supplier_id_norm") == supplier_id_norm:
        score += 0.35
        signals.append("supplier_id_exact")

    if buyer_id_norm and procurement_row.get("_buyer_id_norm") == buyer_id_norm:
        score += 0.20
        signals.append("buyer_id_exact")

    if supplier_norm and procurement_row.get("_supplier_norm") == supplier_norm:
        score += 0.35
        signals.append("supplier_exact")

    if buyer_norm and procurement_row.get("_buyer_norm") == buyer_norm:
        score += 0.20
        signals.append("buyer_exact")

    title_similarity = _token_jaccard(title_tokens, procurement_row.get("_title_tokens", set()))
    if title_similarity > 0:
        score += 0.25 * title_similarity
        signals.append("title_jaccard")

    evidence_year = evidence_row.get("_package_year")
    tender_year = procurement_row.get("_tender_year")
    if pd.notna(evidence_year) and pd.notna(tender_year):
        delta = abs(int(evidence_year) - int(tender_year))
        if delta == 0:
            score += 0.10
            signals.append("year_exact")
        elif delta == 1:
            score += 0.05
            signals.append("year_near")

    evidence_value = evidence_row.get("_value_amount")
    procurement_value = _safe_float(procurement_row.get("_value_amount"))
    if pd.notna(evidence_value) and procurement_value not in (None, 0) and pd.notna(procurement_value):
        ratio = abs(float(evidence_value) - float(procurement_value)) / max(abs(float(evidence_value)), abs(float(procurement_value)))
        if ratio <= 0.05:
            score += 0.10
            signals.append("value_close")
        elif ratio <= 0.15:
            score += 0.07
            signals.append("value_near")
        elif ratio <= 0.30:
            score += 0.03
            signals.append("value_loose")

    return min(score, 1.0), signals


def _determine_match_type(signals: list[str], score: float) -> str:
    signal_set = set(signals)
    if "ocid_exact" in signal_set:
        return "exact_ocid"
    if {"supplier_id_exact", "buyer_id_exact"}.issubset(signal_set):
        return "supplier_buyer_id"
    if {"supplier_id_exact", "title_jaccard"}.issubset(signal_set):
        return "supplier_id_title"
    if "supplier_id_exact" in signal_set:
        return "supplier_id"
    if {"supplier_exact", "buyer_exact", "title_jaccard"}.issubset(signal_set):
        return "supplier_buyer_title"
    if {"supplier_exact", "title_jaccard"}.issubset(signal_set):
        return "supplier_title"
    if {"buyer_exact", "title_jaccard"}.issubset(signal_set):
        return "buyer_title"
    if score >= 0.55:
        return "candidate"
    return "unmatched"


def _reviewer_needed(signals: list[str], score: float) -> bool:
    signal_set = set(signals)
    if "ocid_exact" in signal_set:
        return False
    if {"supplier_id_exact", "buyer_id_exact"}.issubset(signal_set):
        return False
    return not (
        score >= 0.90
        and {"supplier_exact", "buyer_exact", "title_jaccard"}.issubset(signal_set)
    )


def build_evidence_match_table(
    procurement_df: pd.DataFrame,
    evidence_df: pd.DataFrame,
    *,
    min_confidence: float = 0.55,
) -> pd.DataFrame:
    procurement = _prep_procurement(procurement_df)
    evidence = _prep_evidence(evidence_df)
    procurement_indexes = _build_procurement_indexes(procurement)

    rows: list[dict[str, Any]] = []
    for _, evidence_row in evidence.iterrows():
        matched_ocid = _clean_text(evidence_row.get("matched_ocid"))
        if matched_ocid:
            direct = procurement[procurement["ocid"] == matched_ocid]
            if not direct.empty:
                procurement_row = direct.iloc[0]
                rows.append(
                    {
                        "source_record_id": evidence_row.get("source_record_id"),
                        "source_name": evidence_row.get("source_name"),
                        "label_family": evidence_row.get("label_family"),
                        "ocid": procurement_row.get("ocid"),
                        "match_type": "exact_ocid",
                        "match_confidence": 1.0,
                        "matched_on": "ocid_exact",
                        "reviewer_needed": False,
                        "matched_supplier_name": procurement_row.get("supplier_name"),
                        "matched_buyer_name": procurement_row.get("buyer_name"),
                        "matched_tender_title": procurement_row.get("tender_title"),
                    }
                )
                continue

        candidate_indices = _candidate_indices(procurement_indexes, evidence_row, min_title_overlap=2)
        full_scan_needed = False
        if not candidate_indices:
            if _max_score_without_strong_candidates(evidence_row) < min_confidence:
                rows.append(_unmatched_row(evidence_row))
                continue
            candidate_indices = _candidate_indices(procurement_indexes, evidence_row, min_title_overlap=1)
            if not candidate_indices:
                full_scan_needed = True

        candidates = procurement if full_scan_needed else procurement.loc[sorted(candidate_indices)]

        best_rows: list[pd.Series] = []
        best_score = -1.0
        best_signals: list[str] = []
        best_signal_set: set[str] = set()
        for _, procurement_row in candidates.iterrows():
            score, signals = _score_match(procurement_row, evidence_row)
            if score > best_score + TIE_SCORE_EPSILON:
                best_rows = [procurement_row]
                best_score = score
                best_signals = signals
                best_signal_set = set(signals)
            elif abs(score - best_score) <= TIE_SCORE_EPSILON:
                best_rows.append(procurement_row)
                best_signal_set.update(signals)

        if not best_rows or best_score < min_confidence:
            rows.append(_unmatched_row(evidence_row, confidence=best_score))
            continue

        if len(best_rows) > 1:
            rows.append(
                _ambiguous_match_row(
                    evidence_row,
                    score=best_score,
                    signals=sorted(best_signal_set),
                )
            )
            continue

        best_row = best_rows[0]
        rows.append(
            {
                "source_record_id": evidence_row.get("source_record_id"),
                "source_name": evidence_row.get("source_name"),
                "label_family": evidence_row.get("label_family"),
                "ocid": best_row.get("ocid"),
                "match_type": _determine_match_type(best_signals, best_score),
                "match_confidence": round(float(best_score), 4),
                "matched_on": "|".join(best_signals),
                "reviewer_needed": _reviewer_needed(best_signals, best_score),
                "matched_supplier_name": best_row.get("supplier_name"),
                "matched_buyer_name": best_row.get("buyer_name"),
                "matched_tender_title": best_row.get("tender_title"),
            }
        )

    return pd.DataFrame(rows, columns=MATCH_COLUMNS)


def apply_match_results_to_label_records(label_df: pd.DataFrame, match_df: pd.DataFrame) -> pd.DataFrame:
    if label_df.empty:
        return label_df.copy()
    if match_df.empty:
        return label_df.copy()

    merged = label_df.merge(
        match_df[
            [
                "source_record_id",
                "source_name",
                "ocid",
                "match_confidence",
                "reviewer_needed",
                "match_type",
                "matched_on",
            ]
        ],
        on=["source_record_id", "source_name"],
        how="left",
        suffixes=("", "_match"),
    )
    merged["ocid"] = merged["ocid_match"].combine_first(merged["ocid"])
    if "confidence_score" not in merged.columns:
        merged["confidence_score"] = None
    if "reviewer_needed" not in merged.columns:
        merged["reviewer_needed"] = True
    merged["confidence_score"] = merged["match_confidence"].where(
        merged["match_confidence"].notna(),
        merged["confidence_score"],
    )
    merged["reviewer_needed"] = merged["reviewer_needed_match"].where(
        merged["reviewer_needed_match"].notna(),
        merged["reviewer_needed"],
    ).fillna(True)
    merged["match_type"] = merged["match_type"].fillna("unmatched")
    merged["matched_on"] = merged["matched_on"].fillna("")
    return merged.drop(columns=["ocid_match", "match_confidence", "reviewer_needed_match"])

"""Normalize LKPP/INAPROC blacklist source rows into the common evidence schema."""

from __future__ import annotations

from typing import Any

from src.evidence import _clean_numeric

SOURCE_NAME = "lkpp_inaproc_blacklist"
SOURCE_TYPE = "sanction_list"
ORGANIZATION = "LKPP / INAPROC"


def _first_nonempty(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _safe_float(value: Any) -> float | None:
    return _clean_numeric(value)


def _first_numeric(*values: Any) -> float | None:
    for value in values:
        numeric = _safe_float(value)
        if numeric is not None:
            return numeric
    return None


def _compose_provenance_note(record: dict[str, Any]) -> str:
    fragments = [
        f"nomor_sk={record.get('nomor_sk')}" if record.get("nomor_sk") else None,
        f"jenis_pelanggaran={record.get('jenis_pelanggaran')}" if record.get("jenis_pelanggaran") else None,
        f"tanggal_selesai={record.get('tanggal_selesai')}" if record.get("tanggal_selesai") else None,
        f"satker={record.get('satker')}" if record.get("satker") else None,
    ]
    return " | ".join(fragment for fragment in fragments if fragment)


def transform_lkpp_inaproc_blacklist_record(record: dict[str, Any]) -> dict[str, Any]:
    supplier_name = _first_nonempty(record.get("supplier_name"), record.get("nama_penyedia"))
    detail_url = _first_nonempty(record.get("source_url"), record.get("detail_url"), record.get("url"))
    record_id = _first_nonempty(
        record.get("source_record_id"),
        record.get("id"),
        record.get("blacklist_id"),
        record.get("nomor_sk"),
        supplier_name,
    )
    package_name = _first_nonempty(record.get("package_name"), record.get("nama_paket"))
    buyer_name = _first_nonempty(record.get("buyer_name"), record.get("kl_pd"))

    return {
        "source_record_id": record_id,
        "source_name": SOURCE_NAME,
        "source_type": SOURCE_TYPE,
        "source_url": detail_url,
        "title": package_name or "Daftar Hitam Penyedia",
        "organization": _first_nonempty(record.get("organization"), ORGANIZATION),
        "label_family": _first_nonempty(record.get("label_family"), "sanctioned_supplier"),
        "label_value": _first_nonempty(record.get("label_value"), "daftar_hitam_penyedia"),
        "evidence_strength": _first_nonempty(record.get("evidence_strength"), "high"),
        "case_stage": _first_nonempty(record.get("case_stage"), "administrative_sanction"),
        "decision_date": _first_nonempty(record.get("decision_date"), record.get("tanggal_berlaku")),
        "publication_date": _first_nonempty(record.get("publication_date"), record.get("tanggal_tayang")),
        "supplier_name": supplier_name,
        "supplier_id": _first_nonempty(record.get("supplier_id"), record.get("npwp_penyedia"), record.get("nib_penyedia")),
        "buyer_name": buyer_name,
        "buyer_id": _first_nonempty(record.get("buyer_id"), record.get("satker_id")),
        "matched_ocid": _first_nonempty(record.get("matched_ocid"), record.get("ocid")),
        "match_confidence": record.get("match_confidence"),
        "provenance_note": _first_nonempty(record.get("provenance_note"), _compose_provenance_note(record)),
        "package_name": package_name,
        "package_id": _first_nonempty(record.get("package_id"), record.get("id_rup_tender"), record.get("tender_id")),
        "package_value_amount": _first_numeric(record.get("package_value_amount"), record.get("hps"), record.get("pagu")),
        "package_year": _first_nonempty(record.get("package_year"), record.get("tahun_anggaran")),
        "procurement_category": _first_nonempty(record.get("procurement_category"), record.get("jenis_pengadaan")),
        "sanction_end_date": _first_nonempty(record.get("sanction_end_date"), record.get("tanggal_selesai")),
    }


def transform_lkpp_inaproc_blacklist_records(records: list[dict]) -> list[dict]:
    return [transform_lkpp_inaproc_blacklist_record(record) for record in records]

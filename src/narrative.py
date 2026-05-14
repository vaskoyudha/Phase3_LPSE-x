"""Bahasa Indonesia explanation rendering utilities."""

from __future__ import annotations

from typing import Any, Iterable

RISK_LABEL_ID = {
    0: "Risiko Rendah",
    1: "Risiko Sedang",
    2: "Risiko Tinggi",
}

BUSINESS_RATING_ID = {
    "aman": "Aman",
    "perlu_pantauan": "Perlu Pantauan",
    "risiko_tinggi": "Risiko Tinggi",
    "risiko_kritis": "Risiko Kritis",
}

FEATURE_LABELS = {
    "f_single_bidder": "indikasi peserta tunggal",
    "f_num_tenderers": "jumlah peserta tender",
    "f_price_deviation_ratio": "rasio deviasi harga terhadap nilai tender",
    "f_procurement_method_enc": "metode pengadaan",
    "f_is_q4": "waktu publikasi pada kuartal IV",
    "f_is_december": "publikasi pada bulan Desember",
    "f_tender_value_log": "nilai tender",
    "f_award_value_log": "nilai pemenang",
    "f_contract_value_log": "nilai kontrak",
    "f_title_length": "panjang judul tender",
    "f_description_length": "kelengkapan deskripsi tender",
    "f_buyer_supplier_repeat_count": "frekuensi hubungan buyer-supplier berulang",
    "f_tender_value_zscore_buyer": "nilai tender dibanding pola historis buyer",
    "f_supplier_recent_90d_award_count": "aktivitas award supplier dalam 90 hari terakhir",
    "f_buyer_recent_30d_tender_count": "aktivitas tender buyer dalam 30 hari terakhir",
    "f_supplier_capacity_ratio": "rasio kapasitas supplier terhadap nilai paket",
    "f_buyer_value_growth_rate": "perubahan nilai belanja buyer",
    "f_days_since_last_buyer_tender": "jeda sejak tender buyer sebelumnya",
    "f_buyer_hist_avg_value": "rata-rata nilai historis buyer",
    "f_buyer_hist_tender_count": "jumlah tender historis buyer",
    "f_supplier_hist_win_count": "riwayat kemenangan supplier",
}

FEATURE_REVIEW_GUIDANCE = {
    "f_tender_value_log": (
        "Nilai tender relatif besar",
        "Nilai paket berada pada skala yang perlu dibandingkan dengan paket sejenis.",
        "Bandingkan HPS/nilai tender dengan paket sejenis, ruang lingkup pekerjaan, dan riwayat buyer.",
    ),
    "f_tender_value_zscore_buyer": (
        "Nilai tender menyimpang dari pola buyer",
        "Nilai tender tampak menonjol dibanding pola historis buyer yang sama.",
        "Cek apakah kenaikan nilai dijelaskan oleh volume, spesifikasi, lokasi, atau kondisi pasar.",
    ),
    "f_buyer_supplier_repeat_count": (
        "Hubungan buyer-supplier berulang",
        "Model melihat relasi buyer-supplier yang berulang sehingga perlu konteks historis.",
        "Tinjau daftar paket sebelumnya, metode pengadaan, dan alasan administratif relasi berulang.",
    ),
    "f_price_deviation_ratio": (
        "Deviasi harga perlu konteks",
        "Rasio harga berbeda dari nilai acuan yang dipakai fitur model.",
        "Bandingkan nilai penawaran, HPS, pagu, dan dokumen evaluasi harga.",
    ),
    "f_is_q4": (
        "Publikasi kuartal IV",
        "Waktu publikasi pada akhir tahun dapat memengaruhi pola risiko model.",
        "Periksa apakah jadwal akhir tahun memiliki justifikasi perencanaan dan dokumen pendukung.",
    ),
    "f_is_december": (
        "Publikasi Desember",
        "Publikasi pada bulan Desember dapat menjadi sinyal kalender yang perlu dikontekstualkan.",
        "Cek timeline perencanaan, pengumuman, evaluasi, dan kontrak.",
    ),
    "f_supplier_recent_90d_award_count": (
        "Aktivitas award supplier terbaru",
        "Supplier memiliki aktivitas kemenangan dalam 90 hari terakhir menurut fitur lokal.",
        "Verifikasi kapasitas pelaksanaan, beban kontrak berjalan, dan bukti kinerja supplier.",
    ),
    "f_description_length": (
        "Kelengkapan deskripsi tender",
        "Panjang deskripsi membantu model membaca kelengkapan informasi paket.",
        "Pastikan spesifikasi, volume, lokasi, dan keluaran pekerjaan tertulis jelas.",
    ),
    "f_title_length": (
        "Kejelasan judul tender",
        "Judul paket memberi sinyal konteks awal ke model.",
        "Cek apakah judul cukup spesifik untuk mengidentifikasi pekerjaan dan kebutuhan buyer.",
    ),
}

SAFETY_NOTE = (
    "Catatan penting: ini adalah triase risiko untuk prioritas review, bukan tuduhan pelanggaran "
    "atau putusan akhir. Probabilitas model bukan kepastian hukum dan wajib diverifikasi manusia."
)

CRITICAL_EVIDENCE_FAMILIES = {
    "confirmed_fraud",
    "sanctioned_supplier",
}

OFFICIAL_IRREGULARITY_STAGES = {
    "final_outcome",
    "audit_finding",
    "administrative_sanction",
}

WATCHLIST_EVIDENCE_FAMILIES = {
    "reviewed_risk",
    "candidate_review_queue",
}


def _format_value(value) -> str:
    if value is None:
        return "tidak tersedia"
    if isinstance(value, float):
        return f"{value:.4f}".rstrip("0").rstrip(".")
    return str(value)


def _format_signed_shap(value: float) -> str:
    formatted = f"{float(value):+.3f}".rstrip("0").rstrip(".")
    return formatted if formatted not in {"+0", "-0"} else "0"


def _feature_label(feature: str) -> str:
    return FEATURE_LABELS.get(feature, feature.replace("_", " "))


def _factor_title(feature: str) -> str:
    guidance = FEATURE_REVIEW_GUIDANCE.get(feature)
    if guidance:
        return guidance[0]
    return _feature_label(feature).capitalize()


def _factor_reason(
    feature: str,
    direction: str,
    *,
    value_display: str = "tidak tersedia",
    shap_value: float = 0.0,
) -> str:
    guidance = FEATURE_REVIEW_GUIDANCE.get(feature)
    base = guidance[1] if guidance else None
    verb = "menaikkan" if direction == "increases_risk" else "menurunkan"
    impact = _impact_label(shap_value)
    shap_display = _format_signed_shap(shap_value)
    if guidance:
        return (
            f"{base} Nilai fitur {value_display} dengan SHAP {shap_display} {verb} skor risiko "
            f"dari baseline model ({impact}). Sinyal ini perlu dibaca bersama faktor lain dan bukan bukti tunggal."
        )
    return (
        f"Fitur ini bernilai {value_display}; SHAP {shap_display} {verb} skor risiko dari baseline model "
        f"({impact}). Verifikasi bersama dokumen paket dan faktor lain sebelum menentukan tindak lanjut."
    )


def _factor_review_check(feature: str, direction: str) -> str:
    guidance = FEATURE_REVIEW_GUIDANCE.get(feature)
    if guidance:
        return guidance[2]
    if direction == "decreases_risk":
        return "Pastikan faktor penurun risiko ini memang didukung dokumen pengadaan."
    return "Verifikasi faktor ini terhadap dokumen resmi sebelum menyimpulkan tindak lanjut."


def _impact_label(shap_value: float) -> str:
    magnitude = abs(float(shap_value))
    if magnitude >= 3:
        return "dampak sangat kuat"
    if magnitude >= 1:
        return "dampak kuat"
    if magnitude >= 0.25:
        return "dampak sedang"
    return "dampak kecil"


def _confidence_label(probability: float) -> str:
    if probability >= 0.995:
        return "Keyakinan model sangat tinggi (mendekati 100%)"
    if probability >= 0.85:
        return "Keyakinan model sangat tinggi"
    if probability >= 0.65:
        return "Keyakinan model tinggi"
    if probability >= 0.45:
        return "Keyakinan model sedang"
    return "Keyakinan model rendah"


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _base_business_rating(predicted_class: int) -> tuple[str, str]:
    mapping = {
        0: ("aman", BUSINESS_RATING_ID["aman"]),
        1: ("perlu_pantauan", BUSINESS_RATING_ID["perlu_pantauan"]),
        2: ("risiko_tinggi", BUSINESS_RATING_ID["risiko_tinggi"]),
    }
    return mapping.get(int(predicted_class), ("perlu_pantauan", BUSINESS_RATING_ID["perlu_pantauan"]))


def derive_business_rating(
    explanation: dict,
    evidence_records: Iterable[dict] | None = None,
) -> dict[str, str]:
    """Map the 3-class model output plus evidence lane into a 4-level judge-facing rating."""
    predicted_class = int(explanation.get("predicted_class", 1))
    predicted_label = _normalize_text(explanation.get("predicted_label")) or RISK_LABEL_ID.get(
        predicted_class, str(predicted_class)
    )

    evidence_list = list(evidence_records or [])
    critical_records: list[dict] = []
    watchlist_records: list[dict] = []
    for record in evidence_list:
        family = _normalize_text(record.get("label_family"))
        stage = _normalize_text(record.get("case_stage"))
        reviewer_needed = bool(record.get("reviewer_needed", False))
        if not family:
            continue
        if not reviewer_needed and (
            family in CRITICAL_EVIDENCE_FAMILIES
            or (family == "confirmed_irregularity" and stage in OFFICIAL_IRREGULARITY_STAGES)
        ):
            critical_records.append(record)
        elif family in WATCHLIST_EVIDENCE_FAMILIES or reviewer_needed:
            watchlist_records.append(record)

    if critical_records:
        critical_families = sorted(
            {_normalize_text(record.get("label_family")) for record in critical_records if record.get("label_family")}
        )
        sources = sorted(
            {_normalize_text(record.get("source_name")) for record in critical_records if record.get("source_name")}
        )
        return {
            "rating_code": "risiko_kritis",
            "rating_label": BUSINESS_RATING_ID["risiko_kritis"],
            "rating_source": "official_evidence",
            "rating_reason": (
                "Diprioritaskan untuk review kritis karena ada referensi bukti resmi yang perlu diverifikasi "
                f"({', '.join(critical_families)}) dari sumber {', '.join(sources) or 'resmi'}."
            ),
        }

    base_code, base_label = _base_business_rating(predicted_class)
    if watchlist_records and base_code == "aman":
        return {
            "rating_code": "perlu_pantauan",
            "rating_label": BUSINESS_RATING_ID["perlu_pantauan"],
            "rating_source": "review_queue",
            "rating_reason": (
                "Dinaikkan ke Perlu Pantauan karena sudah ada sinyal evidence/review queue, "
                "meski model dasar belum menempatkan paket pada kelas tinggi."
            ),
        }

    return {
        "rating_code": base_code,
        "rating_label": base_label,
        "rating_source": "model_only",
        "rating_reason": (
            f"Diturunkan dari kelas triase model {predicted_label}; gunakan sebagai urutan prioritas review."
        ),
    }


def render_factor_sentence(factor: dict) -> str:
    """Render one explanation factor into a short Indonesian sentence."""
    feature = str(factor["feature"])
    label = factor.get("feature_label") or _feature_label(feature)
    value = _format_value(factor.get("value", factor.get("feature_value")))
    shap_value = float(factor.get("shap_value", 0.0))
    impact = _impact_label(shap_value)
    direction = factor.get("direction")
    if direction == "decreases_risk" or shap_value < 0:
        verb = "menurunkan"
    else:
        verb = "meningkatkan"
    return (
        f"{label.capitalize()} bernilai {value}; SHAP {_format_signed_shap(shap_value)} {verb} "
        f"skor risiko dari baseline model dengan {impact}."
    )


def build_explanation_brief(
    explanation: dict,
    *,
    evidence_records: Iterable[dict] | None = None,
    business_rating: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a structured, auditor-friendly explanation payload."""
    predicted_class = explanation.get("predicted_class")
    label = explanation.get("predicted_label") or RISK_LABEL_ID.get(predicted_class, str(predicted_class))
    probability = float(explanation.get("probability", 0.0))
    factors = list(explanation.get("factors", []))
    business_rating = business_rating or derive_business_rating(explanation, evidence_records=evidence_records)
    positive = sorted(
        (factor for factor in factors if float(factor.get("shap_value", 0.0)) >= 0),
        key=lambda factor: float(factor.get("shap_value", 0.0)),
        reverse=True,
    )
    negative = sorted(
        (factor for factor in factors if float(factor.get("shap_value", 0.0)) < 0),
        key=lambda factor: abs(float(factor.get("shap_value", 0.0))),
        reverse=True,
    )

    def render_driver(factor: dict) -> dict[str, Any]:
        feature = str(factor.get("feature", "fitur"))
        shap_value = float(factor.get("shap_value", 0.0))
        direction = "decreases_risk" if shap_value < 0 or factor.get("direction") == "decreases_risk" else "increases_risk"
        value_display = _format_value(factor.get("value", factor.get("feature_value")))
        return {
            "feature": feature,
            "title": _factor_title(feature),
            "human_label": factor.get("feature_label") or _feature_label(feature),
            "value_display": value_display,
            "shap_value": round(shap_value, 6),
            "impact_label": _impact_label(shap_value),
            "direction": direction,
            "direction_label": "Menaikkan prioritas review" if direction == "increases_risk" else "Menurunkan prioritas review",
            "reason": _factor_reason(feature, direction, value_display=value_display, shap_value=shap_value),
            "reviewer_check": _factor_review_check(feature, direction),
        }

    top_drivers = [render_driver(factor) for factor in positive[:3]]
    risk_reducers = [render_driver(factor) for factor in negative[:2]]
    if top_drivers:
        driver_copy = ", ".join(item["title"].lower() for item in top_drivers[:3])
        summary = (
            f"Paket ini masuk prioritas {business_rating['rating_label']} karena model melihat sinyal utama: "
            f"{driver_copy}. Gunakan ringkasan ini sebagai arahan review awal, bukan kesimpulan pelanggaran."
        )
    else:
        summary = (
            f"Paket ini masuk prioritas {business_rating['rating_label']} berdasarkan kombinasi fitur model, "
            "tetapi tidak ada faktor peningkat risiko dominan pada payload."
        )

    checklist = [item["reviewer_check"] for item in top_drivers]
    checklist.extend(item["reviewer_check"] for item in risk_reducers)
    checklist.append("Pastikan semua kesimpulan mengacu pada dokumen LPSE/kontrak resmi dan konteks administratif.")

    return {
        "summary": summary,
        "confidence_label": _confidence_label(probability),
        "model_interpretation": (
            f"Model mengelompokkan paket sebagai {label}. Angka probabilitas dipakai untuk mengurutkan prioritas review, "
            "bukan untuk menyatakan kepastian hukum."
        ),
        "top_drivers": top_drivers,
        "risk_reducers": risk_reducers,
        "reviewer_checklist": list(dict.fromkeys(checklist)),
        "shap_note": (
            "SHAP menunjukkan faktor mana yang menggeser skor model naik atau turun dari baseline. "
            "Nilai SHAP besar berarti pengaruh model lebih kuat, bukan bukti pelanggaran."
        ),
        "safety_note": SAFETY_NOTE,
    }


def render_counterfactuals(counterfactuals: Iterable[dict]) -> list[str]:
    """Render SHAP-based counterfactual suggestions in Indonesian."""
    rendered: list[str] = []
    for item in counterfactuals:
        if "message" in item:
            rendered.append(str(item["message"]))
            continue
        feature = _feature_label(item.get("feature", "fitur"))
        suggestion = item.get("suggestion", "tinjau kembali faktor ini")
        impact = item.get("impact")
        if impact is None:
            rendered.append(f"- {feature.capitalize()}: {suggestion}.")
        else:
            rendered.append(
                f"- {feature.capitalize()}: {suggestion} (perkiraan dampak {float(impact):.4f})."
            )
    return rendered


def render_explanation_narrative(
    explanation: dict,
    counterfactuals: Iterable[dict] | None = None,
    *,
    evidence_records: Iterable[dict] | None = None,
    business_rating: dict[str, str] | None = None,
) -> str:
    """Convert an explain_single payload into a Bahasa Indonesia narrative."""
    predicted_class = explanation.get("predicted_class")
    label = explanation.get("predicted_label") or RISK_LABEL_ID.get(predicted_class, str(predicted_class))
    factors = explanation.get("factors", [])
    business_rating = business_rating or derive_business_rating(explanation, evidence_records=evidence_records)
    brief = build_explanation_brief(explanation, evidence_records=evidence_records, business_rating=business_rating)

    lines = [
        f"Peringkat prioritas review paket ini adalah **{business_rating['rating_label']}**.",
        brief["summary"],
        f"{brief['confidence_label']} untuk kelas **{label}**; probabilitas digunakan sebagai skor triase, bukan kepastian hukum.",
    ]

    if business_rating["rating_source"] != "official_evidence":
        lines.append(
            SAFETY_NOTE
        )
    else:
        lines.append(
            "Catatan penting: prioritas review kritis didukung referensi bukti resmi, tetapi kecocokan entitas dan konteks kasus tetap harus diverifikasi reviewer; ini bukan tuduhan pelanggaran atau putusan akhir."
        )

    if factors:
        lines.append("Faktor utama yang perlu dipahami reviewer:")
        for factor in factors[:5]:
            lines.append(f"- {render_factor_sentence(factor)}")

    lines.append(brief["shap_note"])

    if counterfactuals:
        rendered_cf = render_counterfactuals(counterfactuals)
        if rendered_cf:
            lines.append("Saran tindak lanjut untuk menurunkan risiko:")
            lines.extend(rendered_cf)

    return "\n".join(lines)

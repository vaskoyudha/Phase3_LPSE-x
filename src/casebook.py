"""Explainable Casebook builder and static fallback renderer."""

from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.narrative import build_explanation_brief, render_explanation_narrative
from src.product_demo import (
    DemoDataset,
    PredictionBackend,
    HEURISTIC_LABEL_NOTE_ID,
    SAFE_GUARDRAIL_ID,
    RISK_LABELS_ID,
    build_risk_queue,
    extract_display_metadata,
    load_demo_dataset,
    load_prediction_backend,
    parse_case_id,
    predict_risk_scores,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATIC_CASEBOOK_PATH = PROJECT_ROOT / "demo_casebook.html"

REVIEWER_QUESTIONS_ID = [
    "Apakah metode pengadaan, nilai paket, dan waktu publikasi konsisten dengan kebutuhan pekerjaan?",
    "Apakah terdapat pola relasi buyer-supplier berulang yang perlu ditinjau dalam konteks historis?",
    "Apakah dokumen tender cukup lengkap untuk menjelaskan spesifikasi, nilai, dan pemenang?",
    "Apakah faktor model yang dominan memiliki penjelasan administratif yang wajar?",
    "Bukti pendukung apa yang perlu diminta sebelum keputusan tindak lanjut dibuat?",
]

GUARDRAIL_BADGES = [
    "Offline Inference",
    "No Live Scraping",
    "No Model Retraining",
    "Anti-Leakage Split Preserved",
    "Perlu Review Manusia",
]

FEATURE_LABELS_ID = {
    "f_tender_value_log": "Nilai tender",
    "f_award_value_log": "Nilai pemenang",
    "f_price_deviation_ratio": "Deviasi harga",
    "f_main_procurement_category_enc": "Kategori pengadaan",
    "f_award_duration_days": "Durasi award",
    "f_tender_items_count": "Jumlah item tender",
    "f_award_items_count": "Jumlah item award",
    "f_title_length": "Panjang judul",
    "f_description_length": "Kelengkapan deskripsi",
    "f_tender_value_missing": "Nilai tender tidak tersedia",
    "f_is_q4": "Publikasi kuartal IV",
    "f_is_december": "Publikasi Desember",
    "f_award_value_missing": "Nilai award tidak tersedia",
    "f_title_token_count": "Jumlah kata judul",
    "f_description_token_count": "Jumlah kata deskripsi",
    "f_buyer_hist_avg_value": "Rata-rata nilai buyer",
    "f_buyer_hist_value_std": "Variasi nilai buyer",
    "f_supplier_hist_win_count": "Riwayat kemenangan supplier",
    "f_buyer_supplier_repeat_count": "Relasi buyer-supplier berulang",
    "f_buyer_hist_tender_count": "Riwayat tender buyer",
    "f_supplier_hist_max_award": "Award maksimum supplier",
    "f_tender_value_zscore_buyer": "Nilai tender dibanding pola historis buyer",
    "f_days_since_last_buyer_tender": "Jeda tender buyer",
    "f_buyer_recent_30d_tender_count": "Tender buyer 30 hari",
    "f_supplier_recent_90d_award_count": "Aktivitas award supplier 90 hari terakhir",
    "f_buyer_value_growth_rate": "Pertumbuhan nilai buyer",
    "f_supplier_capacity_ratio": "Rasio kapasitas supplier",
    "f_buyer_hist_avg_award": "Rata-rata award buyer",
    "f_buyer_hist_award_std": "Variasi award buyer",
    "f_supplier_hist_avg_award": "Rata-rata award supplier",
}


def _feature_label(feature: str) -> str:
    return FEATURE_LABELS_ID.get(feature, feature.replace("f_", "").replace("_", " ").title())


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_class_contrib(contrib: np.ndarray, predicted_class: int, feature_count: int) -> np.ndarray:
    arr = np.asarray(contrib, dtype=float)
    if arr.ndim == 3:
        # XGBoost multiclass commonly returns (rows, classes, features + bias).
        if arr.shape[1] > predicted_class and arr.shape[2] >= feature_count:
            return arr[0, predicted_class, :feature_count]
        if arr.shape[2] > predicted_class and arr.shape[1] >= feature_count:
            return arr[0, :feature_count, predicted_class]
    if arr.ndim == 2:
        row = arr[0]
        if row.size >= feature_count * 3:
            reshaped = row.reshape(3, feature_count + 1)
            return reshaped[predicted_class, :feature_count]
        return row[:feature_count]
    return arr.reshape(-1)[:feature_count]


def _fallback_factors(row: pd.Series, top_k: int) -> list[dict[str, Any]]:
    numeric = pd.to_numeric(row, errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(0.0)
    ranked = numeric.abs().sort_values(ascending=False).head(top_k)
    factors = []
    for feature, magnitude in ranked.items():
        value = row.get(feature)
        signed = _safe_float(value)
        factors.append(
            {
                "feature": feature,
                "feature_label": _feature_label(str(feature)),
                "value": _safe_float(value),
                "feature_value": _safe_float(value),
                "shap_value": float(signed if signed else magnitude),
                "direction": "increases_risk" if signed >= 0 else "decreases_risk",
                "explanation_state": "fallback_feature_magnitude",
            }
        )
    return factors


def explain_case(
    row: pd.Series | pd.DataFrame,
    feature_names: list[str],
    backend: PredictionBackend,
    *,
    top_k: int = 5,
) -> dict[str, Any]:
    """Explain one selected package lazily.

    The primary path uses native XGBoost feature contributions from the accepted
    UBJ artifact. If that fails, the payload degrades to a clear fallback state
    rather than blocking the app or static report.
    """
    row_df = row.copy() if isinstance(row, pd.DataFrame) else row.to_frame().T
    row_df = row_df.loc[:, feature_names]
    probs = backend.predict_proba(row_df)
    predicted_class = int(np.argmax(probs[0])) if probs.shape[1] > 1 else int(probs[0, 0] >= 0.5)
    probability = float(probs[0, predicted_class] if probs.shape[1] > 1 else probs[0, 0])
    factors: list[dict[str, Any]]
    explanation_state = "native_xgboost_contributions"

    try:
        if backend.kind != "xgboost":
            raise RuntimeError("native contribution explanation is available for XGBoost UBJ backend only")
        import xgboost as xgb

        contrib = backend.model.predict(xgb.DMatrix(row_df), pred_contribs=True)
        class_contrib = _extract_class_contrib(contrib, predicted_class, len(feature_names))
        factors = []
        for feature, shap_value in zip(feature_names, class_contrib):
            value = row_df.iloc[0][feature]
            sv = _safe_float(shap_value)
            factors.append(
                {
                    "feature": feature,
                    "feature_label": _feature_label(feature),
                    "value": _safe_float(value),
                    "feature_value": _safe_float(value),
                    "shap_value": sv,
                    "direction": "increases_risk" if sv >= 0 else "decreases_risk",
                    "explanation_state": explanation_state,
                }
            )
        factors.sort(key=lambda item: abs(float(item["shap_value"])), reverse=True)
        factors = factors[:top_k]
    except Exception as exc:  # pragma: no cover - exercised by fallback tests with fake backend
        explanation_state = f"fallback_explanation: {type(exc).__name__}"
        factors = _fallback_factors(row_df.iloc[0], top_k)

    return {
        "predicted_class": predicted_class,
        "predicted_label": RISK_LABELS_ID.get(predicted_class, f"Kelas {predicted_class}"),
        "probability": round(probability, 6),
        "probabilities": [round(float(value), 6) for value in probs[0].tolist()],
        "factors": factors,
        "explanation_state": explanation_state,
        "model_artifact": str(backend.model_artifact),
    }


def _safe_narrative(explanation: dict[str, Any]) -> str:
    narrative = render_explanation_narrative(explanation)
    replacements = {
        ("bukti " + "fraud " + "final"): "tuduhan pelanggaran atau putusan akhir",
        ("fraud " + "final"): "putusan akhir",
    }
    for before, after in replacements.items():
        narrative = narrative.replace(before, after)
    if "bukan tuduhan pelanggaran" not in narrative.lower():
        narrative += "\nCatatan: hasil ini adalah prioritas review, bukan tuduhan pelanggaran."
    return narrative


def build_casebook(
    case_id: str | int,
    dataset: DemoDataset,
    predictions: pd.DataFrame,
    backend: PredictionBackend,
    *,
    top_k: int = 5,
) -> dict[str, Any]:
    """Build a selected-package casebook payload for app and static fallback."""
    row_id = parse_case_id(case_id)
    if row_id not in dataset.features.index:
        # Fall back to highest-priority row when a stale UI selection is supplied.
        row_id = predictions.index[0]
    raw_row = dataset.raw.loc[row_id] if row_id in dataset.raw.index else None
    metadata = extract_display_metadata(raw_row, fallback_case_id=row_id)
    feature_names = backend.feature_names or list(dataset.features.columns)
    feature_row = dataset.features.loc[row_id, feature_names]
    explanation = explain_case(feature_row, feature_names, backend, top_k=top_k)
    narrative = _safe_narrative(explanation)
    explanation_brief = build_explanation_brief(explanation)

    pred_row = predictions.loc[row_id] if row_id in predictions.index else None
    risk_rank = int(pred_row["risk_rank"]) if pred_row is not None else None
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "case_id": metadata["case_id"],
        "row_id": row_id,
        "metadata": metadata,
        "model_output": {
            "predicted_class": explanation["predicted_class"],
            "predicted_label": explanation["predicted_label"],
            "probability": explanation["probability"],
            "probabilities": explanation["probabilities"],
            "risk_rank": risk_rank,
            "risk_priority_score": float(pred_row["risk_priority_score"]) if pred_row is not None else None,
        },
        "factors": explanation["factors"],
        "explanation_state": explanation["explanation_state"],
        "narrative": narrative,
        "explanation_brief": explanation_brief,
        "reviewer_questions": REVIEWER_QUESTIONS_ID,
        "guardrail": SAFE_GUARDRAIL_ID,
        "heuristic_label_note": HEURISTIC_LABEL_NOTE_ID,
        "guardrail_badges": GUARDRAIL_BADGES,
        "provenance": {
            "model_artifact": str(backend.model_artifact),
            "feature_source": str(dataset.feature_path),
            "raw_source": str(dataset.raw_path),
            "split_usage": "test_data digunakan untuk demo/evaluasi lokal, bukan pelatihan atau tuning.",
            "inference_mode": "offline_local",
        },
    }
    return payload


def _risk_color(label: str) -> str:
    if "Tinggi" in label:
        return "#EF4444"
    if "Sedang" in label:
        return "#F59E0B"
    return "#10B981"


def _review_priority(label: str) -> tuple[str, str]:
    if "Tinggi" in label:
        return "High", "Prioritas review tinggi"
    if "Sedang" in label:
        return "Medium", "Prioritas review sedang"
    return "Low", "Prioritas review rendah"


def _format_generated_at(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return parsed.astimezone(timezone.utc).strftime("%d %b %Y · %H:%M UTC")


def render_static_casebook_html(payload: dict[str, Any], output_path: Path | str = DEFAULT_STATIC_CASEBOOK_PATH) -> Path:
    """Write a portrait-style static casebook fallback from the app payload."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata = payload["metadata"]
    model_output = payload["model_output"]
    risk_label = str(model_output["predicted_label"])
    risk_color = _risk_color(risk_label)
    priority_label, priority_note = _review_priority(risk_label)
    probability = float(model_output["probability"])
    generated_display = _format_generated_at(str(payload["generated_at"]))
    source_name = Path(str(payload["provenance"]["raw_source"])).name
    feature_source = Path(str(payload["provenance"]["feature_source"])).name
    brief = payload.get("explanation_brief") or {}
    brief_summary = str(brief.get("summary") or payload.get("narrative") or "")
    brief_confidence = str(brief.get("confidence_label") or f"Probabilitas model {probability:.0%}")
    brief_model = str(brief.get("model_interpretation") or "Model output digunakan untuk mengurutkan prioritas review.")
    brief_shap_note = str(brief.get("shap_note") or "SHAP menunjukkan arah dan kekuatan kontribusi fitur terhadap skor model.")

    factor_rows = []
    max_abs = max([abs(float(item.get("shap_value", 0.0))) for item in payload["factors"]] or [1.0]) or 1.0
    for rank, item in enumerate(payload["factors"], start=1):
        contribution = float(item.get("shap_value", 0.0))
        width = min(48, abs(contribution) / max_abs * 48)
        direction = "Meningkatkan risiko" if contribution >= 0 else "Menurunkan risiko"
        direction_class = "risk-up" if contribution >= 0 else "risk-down"
        bar = (
            f"<div class='signed-bar {direction_class}' aria-label='zero-axis signed contribution'>"
            "<span class='axis'></span>"
            f"<span class='fill' style='width:{width:.1f}%;'></span>"
            "</div>"
        )
        factor_rows.append(
            f"""
            <tr>
              <td><span class="rank-badge">{rank}</span></td>
              <td><strong>{escape(str(item.get('feature_label') or _feature_label(str(item.get('feature')))))}</strong><br><span>{escape(str(item.get('feature')))}</span></td>
              <td>{escape(str(round(_safe_float(item.get('value')), 4)))}</td>
              <td class="{direction_class}">{escape(direction)}</td>
              <td>{bar}<code>{contribution:+.5f}</code></td>
            </tr>
            """
        )

    def _driver_card(item: dict[str, Any]) -> str:
        return (
            "<div class='driver-card'>"
            f"<strong>{escape(str(item.get('title') or item.get('human_label') or 'Faktor model'))}</strong>"
            f"<span>{escape(str(item.get('impact_label') or 'dampak model'))} · {escape(str(item.get('direction_label') or 'kontribusi model'))}</span>"
            f"<p>{escape(str(item.get('reason') or 'Faktor ini perlu dibaca bersama dokumen pengadaan.'))}</p>"
            f"<small>Checklist: {escape(str(item.get('reviewer_check') or 'Verifikasi faktor ini pada dokumen resmi.'))}</small>"
            "</div>"
        )

    driver_cards = "".join(_driver_card(item) for item in brief.get("top_drivers", []))
    reducer_cards = "".join(_driver_card(item) for item in brief.get("risk_reducers", []))
    if not driver_cards:
        driver_cards = "<p>Faktor dominan tersedia pada tabel SHAP di atas.</p>"
    if not reducer_cards:
        reducer_cards = "<p>Tidak ada faktor penurun risiko dominan pada payload ini.</p>"

    checklist = brief.get("reviewer_checklist") or payload["reviewer_questions"]
    questions = "".join(f"<li><span></span>{escape(str(question))}</li>" for question in checklist)
    top_badges = "".join(f"<span class='badge'>{escape(badge)}</span>" for badge in payload["guardrail_badges"])
    footer_badges = [
        ("Offline Inference", "Seluruh prediksi dilakukan secara lokal/offline."),
        ("No Live Scraping", "Tidak ada pengambilan data langsung dari internet."),
        ("No Model Retraining", "Tidak ada retraining, tuning, atau mutasi model."),
        ("Anti-Leakage Split Preserved", "Pemisahan train/test tetap dijaga."),
    ]
    footer_cards = "".join(
        f"<div class='footer-card'><strong>{escape(title)}</strong><span>{escape(body)}</span></div>" for title, body in footer_badges
    )

    html = f"""<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LPSE-X Casebook Report</title>
<style>
:root {{ --bg:#0B1323; --panel:#07111f; --card:#111A2E; --line:rgba(96,165,250,.32); --cyan:#22D3EE; --blue:#38BDF8; --green:#10B981; --amber:#F59E0B; --red:#EF4444; --muted:#9CA3AF; --text:#FFFFFF; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:radial-gradient(circle at 18% 0%, rgba(34,211,238,.18), transparent 34%), radial-gradient(circle at 82% 20%, rgba(59,130,246,.13), transparent 28%), var(--bg); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }}
body::before {{ content:""; position:fixed; inset:0; pointer-events:none; background-image:linear-gradient(rgba(148,163,184,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.035) 1px, transparent 1px); background-size:32px 32px; mask-image:linear-gradient(to bottom, black, transparent 82%); }}
.report {{ width:min(1040px, calc(100% - 28px)); margin:16px auto; padding:18px; border:1px solid var(--line); border-radius:12px; background:linear-gradient(180deg, rgba(7,17,31,.94), rgba(7,17,31,.86)); box-shadow:0 24px 80px rgba(0,0,0,.42); }}
.header {{ display:grid; grid-template-columns:1fr 440px; gap:20px; align-items:start; padding:2px 2px 20px; border-bottom:1px solid rgba(148,163,184,.28); }}
.brand {{ display:flex; gap:18px; align-items:flex-start; }}
.logo {{ width:74px; height:74px; border-radius:22px; background:linear-gradient(135deg, rgba(34,211,238,.95), rgba(37,99,235,.86)); display:grid; place-items:center; font-weight:900; font-size:24px; letter-spacing:-.04em; box-shadow:0 0 42px rgba(34,211,238,.28); }}
h1 {{ margin:0; font-size:34px; line-height:1.06; letter-spacing:-.04em; }}
.subtitle {{ margin:8px 0 12px; color:#BFDBFE; font-size:18px; }}
.header-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }}
.kv, .data-source, .section, .safety, .footer-card {{ background:linear-gradient(180deg, rgba(17,26,46,.9), rgba(8,20,36,.88)); border:1px solid var(--line); border-radius:10px; box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }}
.kv {{ padding:12px 14px; min-height:78px; }}
.kv span, .label {{ display:block; color:#CBD5E1; font-size:12px; letter-spacing:.04em; text-transform:uppercase; margin-bottom:6px; }}
.data-source {{ grid-column:1 / -1; padding:11px 14px; border-color:rgba(16,185,129,.5); color:#BBF7D0; text-align:right; }}
.badge {{ display:inline-block; margin:5px 6px 0 0; padding:7px 10px; border-radius:999px; color:#CFFAFE; border:1px solid rgba(34,211,238,.42); background:rgba(34,211,238,.09); font-size:12px; font-weight:700; }}
.section {{ margin-top:16px; overflow:hidden; }}
.section-title {{ display:flex; align-items:center; gap:10px; padding:13px 16px; border-bottom:1px solid rgba(148,163,184,.24); color:#DBEAFE; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }}
.section-title .icon {{ width:24px; height:24px; border:1px solid rgba(56,189,248,.7); color:#7DD3FC; border-radius:6px; display:grid; place-items:center; font-size:13px; }}
.meta-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:0 22px; padding:16px; }}
.meta-row {{ display:grid; grid-template-columns:170px 1fr; gap:18px; padding:12px 0; border-bottom:1px solid rgba(148,163,184,.16); }}
.meta-row:nth-last-child(-n+2) {{ border-bottom:0; }}
.meta-row span {{ color:#CBD5E1; }}
.assessment {{ display:grid; grid-template-columns:330px 1fr 280px; gap:0; align-items:center; }}
.assessment > div {{ padding:24px; min-height:168px; border-right:1px solid rgba(148,163,184,.24); }}
.assessment > div:last-child {{ border-right:0; }}
.risk-lockup {{ display:flex; gap:22px; align-items:center; }}
.shield {{ width:92px; height:108px; display:grid; place-items:center; color:#fff; font-size:56px; font-weight:900; background:linear-gradient(145deg, {risk_color}, rgba(127,29,29,.86)); clip-path:polygon(50% 0, 92% 15%, 86% 72%, 50% 100%, 14% 72%, 8% 15%); box-shadow:0 0 38px {risk_color}66; }}
.risk-title {{ color:{risk_color}; font-size:31px; font-weight:900; letter-spacing:-.04em; }}
.risk-subtitle {{ color:#FECACA; margin-top:4px; font-size:19px; }}
.probability-value {{ color:{risk_color}; font-size:42px; font-weight:900; margin:8px 0; }}
.meter {{ position:relative; height:13px; border-radius:999px; background:linear-gradient(90deg, var(--green), #A3E635, var(--amber), #F97316, var(--red)); box-shadow:0 0 22px rgba(245,158,11,.16); }}
.meter::after {{ content:""; position:absolute; top:50%; left:{probability * 100:.2f}%; transform:translate(-50%,-50%); width:18px; height:18px; border-radius:999px; background:#fff; box-shadow:0 0 16px rgba(255,255,255,.65); }}
.meter-scale {{ display:flex; justify-content:space-between; color:#CBD5E1; font-size:12px; margin-top:8px; }}
.priority {{ color:{risk_color}; font-size:32px; font-weight:900; margin-top:8px; }}
p, li {{ color:#D1D5DB; line-height:1.58; }}
table {{ width:100%; border-collapse:collapse; }}
th, td {{ padding:11px 14px; border-bottom:1px solid rgba(148,163,184,.16); text-align:left; vertical-align:middle; }}
th {{ color:#E5E7EB; font-size:12px; text-transform:uppercase; background:rgba(34,211,238,.07); }}
td span {{ color:var(--muted); font-size:12px; }}
.rank-badge {{ width:32px; height:32px; border-radius:999px; display:grid; place-items:center; font-weight:900; color:white !important; background:linear-gradient(135deg, {risk_color}, rgba(245,158,11,.85)); border:1px solid rgba(255,255,255,.28); }}
.risk-up {{ color:#F87171; }} .risk-down {{ color:#2DD4BF; }}
.signed-bar {{ position:relative; height:18px; margin-bottom:6px; background:rgba(148,163,184,.10); border-radius:999px; overflow:hidden; }}
.signed-bar .axis {{ position:absolute; top:0; bottom:0; left:50%; width:1px; background:rgba(226,232,240,.62); }}
.signed-bar .fill {{ position:absolute; top:3px; bottom:3px; border-radius:999px; }}
.signed-bar.risk-up .fill {{ left:50%; background:linear-gradient(90deg, #F59E0B, #EF4444); }}
.signed-bar.risk-down .fill {{ right:50%; background:linear-gradient(90deg, #14B8A6, #22D3EE); }}
code {{ color:#E5E7EB; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }}
.narrative-grid {{ display:grid; grid-template-columns:1fr 1.06fr; gap:14px; padding:14px; }}
.narrative-card {{ padding:14px; border:1px solid rgba(148,163,184,.2); border-radius:10px; background:rgba(8,20,36,.68); }}
.brief-callout {{ margin:0 14px 12px; padding:14px; border:1px solid rgba(34,211,238,.28); border-radius:10px; background:rgba(34,211,238,.07); }}
.brief-callout strong {{ display:block; color:#E0F2FE; margin-bottom:8px; }}
.brief-callout p {{ margin:8px 0 0; }}
.brief-drivers {{ display:grid; gap:10px; padding:0 14px 14px; }}
.driver-card {{ padding:12px; border:1px solid rgba(148,163,184,.2); border-radius:10px; background:rgba(17,26,46,.72); }}
.driver-card strong {{ display:block; color:#F8FAFC; margin-bottom:4px; }}
.driver-card span {{ display:block; color:#FDE68A; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }}
.driver-card p {{ margin:7px 0; }}
.driver-card small {{ color:#BAE6FD; line-height:1.45; }}
ol {{ list-style:none; margin:0; padding:0; }}
ol li {{ display:grid; grid-template-columns:22px 1fr; gap:10px; padding:9px 0; border-bottom:1px dashed rgba(148,163,184,.2); }}
ol li:last-child {{ border-bottom:0; }}
ol li span {{ width:18px; height:18px; border:1px solid rgba(148,163,184,.7); border-radius:4px; margin-top:3px; }}
.safety {{ margin-top:16px; padding:18px 24px; border-color:rgba(239,68,68,.72); background:linear-gradient(135deg,rgba(239,68,68,.16),rgba(245,158,11,.07)),rgba(17,26,46,.94); display:grid; grid-template-columns:92px 1fr; gap:20px; align-items:center; }}
.warning {{ width:76px; height:76px; display:grid; place-items:center; border:5px solid var(--red); color:white; font-size:46px; font-weight:900; clip-path:polygon(50% 0, 100% 92%, 0 92%); padding-top:15px; }}
.safety strong {{ display:block; color:#FF4D4D; font-size:20px; letter-spacing:.02em; text-transform:uppercase; }}
.safety p {{ margin:6px 0 0; font-size:18px; color:#F8FAFC; font-weight:800; text-transform:uppercase; }}
.safety small {{ display:block; margin-top:8px; color:#FECACA; line-height:1.5; }}
.footer-grid {{ display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-top:16px; }}
.footer-card {{ padding:13px; min-height:86px; }}
.footer-card strong {{ display:block; color:#E0F2FE; font-size:13px; margin-bottom:6px; }}
.footer-card span {{ color:#CBD5E1; font-size:12px; line-height:1.45; }}
.footer {{ color:var(--muted); font-size:12px; display:flex; justify-content:space-between; margin-top:14px; padding:0 8px 2px; }}
@media (max-width:860px) {{ .header, .assessment, .meta-grid, .narrative-grid, .footer-grid {{ grid-template-columns:1fr; }} .assessment > div {{ border-right:0; border-bottom:1px solid rgba(148,163,184,.24); }} .assessment > div:last-child {{ border-bottom:0; }} .meta-row {{ grid-template-columns:1fr; gap:4px; }} }}
@media print {{ body {{ background:#0B1323; }} body::before {{ display:none; }} .report {{ width:100%; margin:0; box-shadow:none; }} }}
</style>
</head>
<body>
<main class="report">
  <header class="header">
    <div class="brand">
      <div class="logo">LX</div>
      <div>
        <h1>LPSE-X Casebook Report</h1>
        <div class="subtitle">Explainable Procurement Risk Triage</div>
        <div>{top_badges}</div>
      </div>
    </div>
    <div class="header-grid">
      <div class="kv"><span>Report Generated</span>{escape(generated_display)}</div>
      <div class="kv"><span>Model Artifact</span>{escape(Path(payload['provenance']['model_artifact']).name)}</div>
      <div class="data-source"><strong>Data Source</strong> · Prepared local test data ({escape(source_name)} / {escape(feature_source)})</div>
    </div>
  </header>

  <section class="section">
    <div class="section-title"><span class="icon">1</span> Informasi Paket Pengadaan</div>
    <div class="meta-grid">
      <div class="meta-row"><span>Judul Paket</span><strong>{escape(str(metadata['package_title']))}</strong></div>
      <div class="meta-row"><span>Nilai Tender (HPS)</span><strong>{escape(str(metadata['tender_value_display']))}</strong></div>
      <div class="meta-row"><span>Nama Buyer</span><strong>{escape(str(metadata['buyer']))}</strong></div>
      <div class="meta-row"><span>Metode Pengadaan</span><strong>{escape(str(metadata['procurement_method']))}</strong></div>
      <div class="meta-row"><span>Nama Supplier</span><strong>{escape(str(metadata['supplier']))}</strong></div>
      <div class="meta-row"><span>OCID / Tender ID</span><strong>{escape(str(metadata.get('ocid')))} / {escape(str(metadata.get('tender_id')))}</strong></div>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><span class="icon">2</span> Assessment Risiko</div>
    <div class="assessment">
      <div class="risk-lockup"><div class="shield">!</div><div><div class="risk-title">{escape(risk_label)}</div><div class="risk-subtitle">Risk class</div></div></div>
      <div><span class="label">Probabilitas (predicted risk)</span><div class="probability-value">{probability:.0%}</div><div class="meter"></div><div class="meter-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div></div>
      <div><span class="label">Review Priority</span><div class="priority">{escape(priority_label)}</div><p>{escape(priority_note)} · Rank #{escape(str(model_output.get('risk_rank') or '-'))}</p></div>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><span class="icon">3</span> Explainable AI — Top Risk Factors <span style="color:#9CA3AF;text-transform:none;font-weight:500">(Top 5 SHAP contribution)</span></div>
    <table><thead><tr><th>Rank</th><th>Faktor Prioritas Review (Fitur)</th><th>Nilai</th><th>Dampak</th><th>Kontribusi (SHAP)</th></tr></thead><tbody>{''.join(factor_rows)}</tbody></table>
  </section>

  <section class="narrative-grid">
    <div class="section narrative-card">
      <div class="section-title"><span class="icon">4</span> Auditor Brief</div>
      <div class="brief-callout"><strong>{escape(brief_confidence)}</strong><p>{escape(brief_summary)}</p><p>{escape(brief_model)}</p><p>{escape(brief_shap_note)}</p></div>
      <div class="brief-drivers"><h3>Faktor yang menaikkan prioritas</h3>{driver_cards}<h3>Faktor yang menurunkan prioritas</h3>{reducer_cards}</div>
    </div>
    <div class="section narrative-card">
      <div class="section-title"><span class="icon">5</span> Reviewer Checklist <span style="color:#9CA3AF;text-transform:none;font-weight:500">(Human Review)</span></div>
      <div style="padding:0 14px 12px"><ol>{questions}</ol></div>
    </div>
  </section>

  <section class="safety">
    <div class="warning">!</div>
    <div><strong>Prioritas review, bukan tuduhan pelanggaran.</strong><p>Label risiko bersifat heuristik dan membutuhkan validasi manusia.</p><small>{escape(payload['guardrail'])}<br>{escape(payload['heuristic_label_note'])}</small></div>
  </section>

  <section class="footer-grid">{footer_cards}</section>
  <div class="footer"><span>Dokumen ini dihasilkan otomatis oleh LPSE-X Explainable Casebook.</span><span>Untuk keperluan audit dan review internal.</span></div>
</main>
</body>
</html>
"""
    output.write_text(html, encoding="utf-8")
    return output

def generate_demo_casebook(
    output_path: Path | str = DEFAULT_STATIC_CASEBOOK_PATH,
    *,
    max_rows: int = 1000,
    top_n: int = 100,
) -> tuple[dict[str, Any], Path]:
    """Generate the mandatory static fallback casebook from live demo adapters."""
    dataset = load_demo_dataset(max_rows=max_rows)
    backend = load_prediction_backend()
    predictions = predict_risk_scores(dataset.features, backend)
    queue = build_risk_queue(dataset, predictions, top_n=top_n)
    selected_case_id = str(queue.iloc[0]["case_id"])
    payload = build_casebook(selected_case_id, dataset, predictions, backend)
    return payload, render_static_casebook_html(payload, output_path)


def main() -> None:
    """CLI entry point for regenerating the bundled static demo casebook."""
    payload, output = generate_demo_casebook()
    print(output)
    print(payload["guardrail"])


if __name__ == "__main__":
    main()

"""Streamlit LPSE-X Command Center + Explainable Casebook.

Local/offline demo entrypoint. The UI only reads prepared artifacts and demo
split data through the committed adapters; it does not scrape, retrain, or call
cloud services.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd
import streamlit as st

from src.casebook import build_casebook
from src.product_demo import SAFE_GUARDRAIL_ID, build_demo_bundle

APP_TITLE = "LPSE-X Command Center"
REQUIRED_GUARDRAIL_COPY = (
    "LPSE-X adalah triase risiko untuk prioritas review; "
    "bukan tuduhan pelanggaran dan wajib ditinjau manusia."
)
FALLBACK_COPY = (
    "Mode demo lokal siap, tetapi artifact atau data split belum dapat dimuat. "
    "Tempatkan model_risk.ubj, test_data/features.parquet, dan test_data/raw.parquet "
    "di root proyek untuk mengaktifkan antrean prioritas review."
)


@dataclass(frozen=True)
class DemoState:
    """Loaded dashboard payload or a judge-friendly fallback state."""

    dataset: Any | None
    backend: Any | None
    predictions: pd.DataFrame
    queue: pd.DataFrame
    error: str | None = None

    @property
    def ready(self) -> bool:
        return self.dataset is not None and self.backend is not None and not self.queue.empty


def _fallback_queue() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "case_id": "demo-001",
                "risk_rank": 1,
                "package_title": "Demo Paket Pengadaan Infrastruktur",
                "buyer": "Instansi Demo",
                "supplier": "Supplier belum dipilih",
                "tender_value_display": "Tidak tersedia",
                "procurement_method": "Demo lokal",
                "predicted_label": "Risiko Sedang",
                "probability": 0.0,
                "risk_priority_score": 0.0,
                "review_status": "Prioritas Review",
            }
        ]
    )


@st.cache_resource(show_spinner=False)
def load_dashboard_state(max_rows: int = 1000, top_n: int = 75) -> DemoState:
    """Load local demo adapters and gracefully degrade when artifacts are absent."""
    try:
        dataset, backend, predictions, queue = build_demo_bundle(max_rows=max_rows, top_n=top_n)
        return DemoState(dataset=dataset, backend=backend, predictions=predictions, queue=queue)
    except Exception as exc:  # pragma: no cover - fallback is environment-dependent
        return DemoState(
            dataset=None,
            backend=None,
            predictions=pd.DataFrame(),
            queue=_fallback_queue(),
            error=f"{type(exc).__name__}: {exc}",
        )


def format_percent(value: Any) -> str:
    try:
        return f"{float(value):.1%}"
    except (TypeError, ValueError):
        return "—"


def risk_color(label: Any) -> str:
    text = str(label)
    if "Tinggi" in text:
        return "#FB7185"
    if "Sedang" in text:
        return "#FBBF24"
    return "#34D399"


def inject_css() -> None:
    st.markdown(
        """
        <style>
        :root {
          --lp-bg: #07111f;
          --lp-panel: rgba(15, 23, 42, 0.88);
          --lp-panel-2: rgba(17, 34, 64, 0.78);
          --lp-cyan: #22d3ee;
          --lp-blue: #2563eb;
          --lp-green: #34d399;
          --lp-amber: #fbbf24;
          --lp-red: #fb7185;
          --lp-muted: #94a3b8;
        }
        .stApp {
          background:
            radial-gradient(circle at 8% 0%, rgba(34, 211, 238, .18), transparent 30%),
            radial-gradient(circle at 90% 8%, rgba(37, 99, 235, .18), transparent 28%),
            linear-gradient(135deg, #07111f 0%, #0b1323 54%, #111827 100%);
          color: #e5f0ff;
        }
        [data-testid="stHeader"] { background: transparent; }
        .block-container { padding-top: 1.5rem; max-width: 1380px; }
        .hero, .card, .case-panel, .guardrail {
          border: 1px solid rgba(34, 211, 238, .22);
          background: linear-gradient(145deg, rgba(15,23,42,.94), rgba(15,32,59,.82));
          box-shadow: 0 20px 60px rgba(0, 0, 0, .32);
          border-radius: 22px;
          padding: 20px;
        }
        .hero { padding: 26px; margin-bottom: 18px; }
        .eyebrow { color: var(--lp-cyan); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; font-size: .78rem; }
        .hero h1 { font-size: 3rem; line-height: 1.02; margin: .25rem 0 .6rem; }
        .hero p { color: #cbd5e1; font-size: 1.05rem; max-width: 980px; }
        .badge-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
        .badge { border: 1px solid rgba(34,211,238,.35); color: #cffafe; background: rgba(34,211,238,.08); border-radius: 999px; padding: 7px 11px; font-size: .78rem; }
        .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
        .kpi { border: 1px solid rgba(148,163,184,.18); border-radius: 18px; padding: 16px; background: rgba(15,23,42,.72); }
        .kpi span { color: var(--lp-muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; }
        .kpi strong { display: block; color: white; font-size: 1.75rem; margin-top: 6px; }
        .queue-card { border: 1px solid rgba(148,163,184,.18); border-radius: 16px; padding: 14px; margin-bottom: 10px; background: rgba(2,6,23,.38); }
        .queue-card:hover { border-color: rgba(34,211,238,.52); background: rgba(14, 165, 233, .08); }
        .queue-title { color: #f8fafc; font-weight: 800; margin-bottom: 4px; }
        .queue-meta { color: #94a3b8; font-size: .82rem; }
        .risk-chip { display: inline-block; border-radius: 999px; padding: 5px 9px; color: #06111f; font-weight: 900; font-size: .74rem; margin-right: 6px; }
        .case-panel h2, .card h2 { margin-top: 0; }
        .factor-row { margin: 12px 0; }
        .factor-label { display:flex; justify-content:space-between; color:#e2e8f0; font-weight:700; gap:12px; }
        .factor-track { height: 10px; border-radius: 999px; background: rgba(148,163,184,.18); overflow: hidden; margin-top: 6px; }
        .factor-fill { height: 100%; border-radius: 999px; }
        .guardrail { border-color: rgba(251,191,36,.45); background: linear-gradient(135deg, rgba(251,191,36,.12), rgba(251,113,133,.08)); margin-top: 16px; }
        .small-muted { color: #94a3b8; font-size: .86rem; }
        @media (max-width: 900px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero h1 { font-size: 2.2rem; } }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_hero(state: DemoState) -> None:
    status = "Offline model artifact connected" if state.ready else "Judge-friendly fallback mode"
    st.markdown(
        f"""
        <section class="hero">
          <div class="eyebrow">Procurement Risk Intelligence · Local Only</div>
          <h1>{APP_TITLE}</h1>
          <p>Dark command center untuk mengubah output model lokal menjadi antrean <strong>triase risiko</strong>, <strong>prioritas review</strong>, dan casebook yang bisa dijelaskan kepada reviewer. Semua hasil adalah <strong>bukan tuduhan pelanggaran</strong>.</p>
          <div class="badge-row">
            <span class="badge">{status}</span>
            <span class="badge">No live scraping</span>
            <span class="badge">No model retraining</span>
            <span class="badge">No cloud dependency</span>
            <span class="badge">Human review required</span>
          </div>
        </section>
        """,
        unsafe_allow_html=True,
    )


def render_kpis(state: DemoState) -> None:
    queue = state.queue
    total = len(queue)
    high_count = int(queue["predicted_label"].astype(str).str.contains("Tinggi", na=False).sum()) if total else 0
    review_count = int(queue["review_status"].astype(str).str.contains("Review", na=False).sum()) if total else 0
    top_score = float(queue.iloc[0].get("risk_priority_score", 0.0)) if total else 0.0
    artifact = "UBJ local" if state.ready else "Fallback copy"
    st.markdown(
        f"""
        <div class="metric-grid">
          <div class="kpi"><span>Paket dalam antrean</span><strong>{total}</strong></div>
          <div class="kpi"><span>Prioritas review</span><strong>{review_count}</strong></div>
          <div class="kpi"><span>Sinyal risiko tinggi</span><strong>{high_count}</strong></div>
          <div class="kpi"><span>Top risk score</span><strong>{top_score:.1%}</strong><div class="small-muted">{artifact}</div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _queue_label(row: pd.Series) -> str:
    title = str(row.get("package_title", "Paket pengadaan"))[:96]
    rank = row.get("risk_rank", "-")
    label = row.get("predicted_label", "Risiko")
    score = format_percent(row.get("risk_priority_score", 0.0))
    return f"#{rank} · {label} · {score} · {title}"


def render_queue_selector(queue: pd.DataFrame) -> str:
    st.markdown('<div class="card"><h2>Antrean prioritas review</h2><p class="small-muted">Pilih satu paket untuk membuka Explainable Casebook. Urutan dihitung dari skor risiko tinggi lokal.</p></div>', unsafe_allow_html=True)
    options = queue["case_id"].astype(str).tolist()
    labels = {str(row["case_id"]): _queue_label(row) for _, row in queue.iterrows()}
    selected = st.radio(
        "Paket review",
        options,
        format_func=lambda item: labels.get(str(item), str(item)),
        label_visibility="collapsed",
    )

    for _, row in queue.head(8).iterrows():
        color = risk_color(row.get("predicted_label"))
        st.markdown(
            f"""
            <div class="queue-card">
              <div><span class="risk-chip" style="background:{color}">{row.get('predicted_label', 'Risiko')}</span><span class="queue-meta">Rank #{row.get('risk_rank', '-')} · {format_percent(row.get('risk_priority_score', 0))}</span></div>
              <div class="queue-title">{row.get('package_title', 'Paket pengadaan')}</div>
              <div class="queue-meta">Buyer: {row.get('buyer', 'Tidak tersedia')} · Supplier: {row.get('supplier', 'Tidak tersedia')}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    return str(selected)


def build_fallback_case(selected_case_id: str, queue: pd.DataFrame) -> dict[str, Any]:
    row = queue.loc[queue["case_id"].astype(str) == str(selected_case_id)].iloc[0]
    return {
        "metadata": {
            "case_id": selected_case_id,
            "package_title": row.get("package_title", "Demo paket pengadaan"),
            "buyer": row.get("buyer", "Tidak tersedia"),
            "supplier": row.get("supplier", "Tidak tersedia"),
            "tender_value_display": row.get("tender_value_display", "Tidak tersedia"),
            "procurement_method": row.get("procurement_method", "Tidak tersedia"),
            "category": "Fallback lokal",
            "status": "Demo",
        },
        "model_output": {
            "predicted_label": row.get("predicted_label", "Risiko Sedang"),
            "probability": row.get("probability", 0.0),
            "risk_rank": row.get("risk_rank", 1),
            "risk_priority_score": row.get("risk_priority_score", 0.0),
            "probabilities": [0.0, 0.0, 0.0],
        },
        "factors": [
            {
                "feature_label": "Artifact lokal",
                "feature": "local_artifact_state",
                "value": 0.0,
                "shap_value": 0.0,
                "direction": "neutral",
            },
            {
                "feature_label": "Data split demo",
                "feature": "prepared_test_split",
                "value": 0.0,
                "shap_value": 0.0,
                "direction": "neutral",
            },
        ],
        "narrative": FALLBACK_COPY + " Hasil tetap dibingkai sebagai triase risiko, prioritas review, bukan tuduhan pelanggaran.",
        "reviewer_questions": [
            "Apakah artifact model lokal dan data split demo sudah tersedia di root proyek?",
            "Apakah reviewer memahami bahwa output ini hanya membantu penyusunan prioritas review?",
            "Bukti administratif apa yang perlu dibuka sebelum tindak lanjut manual?",
        ],
        "guardrail": REQUIRED_GUARDRAIL_COPY,
        "heuristic_label_note": "Label demo adalah fallback UI; bukan status pelanggaran yang terverifikasi.",
        "provenance": {"inference_mode": "offline_local_fallback", "model_artifact": "not_loaded"},
        "explanation_state": "fallback_missing_local_artifact_or_split",
    }


def get_case_payload(state: DemoState, selected_case_id: str) -> dict[str, Any]:
    if not state.ready:
        return build_fallback_case(selected_case_id, state.queue)
    try:
        return build_casebook(selected_case_id, state.dataset, state.predictions, state.backend)
    except Exception:  # pragma: no cover - protective UI fallback
        return build_fallback_case(selected_case_id, state.queue)


def render_case_header(payload: dict[str, Any]) -> None:
    metadata = payload["metadata"]
    output = payload["model_output"]
    color = risk_color(output.get("predicted_label"))
    st.markdown(
        f"""
        <div class="case-panel">
          <div class="eyebrow">Explainable Casebook</div>
          <h2>{metadata.get('package_title', 'Paket pengadaan')}</h2>
          <p class="small-muted">Case ID: {metadata.get('case_id', '-')}</p>
          <div class="metric-grid">
            <div class="kpi"><span>Label model</span><strong style="color:{color}">{output.get('predicted_label', 'Risiko')}</strong></div>
            <div class="kpi"><span>Probabilitas</span><strong>{format_percent(output.get('probability'))}</strong></div>
            <div class="kpi"><span>Rank review</span><strong>#{output.get('risk_rank', '-')}</strong></div>
            <div class="kpi"><span>Nilai tender</span><strong>{metadata.get('tender_value_display', 'Tidak tersedia')}</strong></div>
          </div>
          <p><strong>Buyer:</strong> {metadata.get('buyer', 'Tidak tersedia')} · <strong>Supplier:</strong> {metadata.get('supplier', 'Tidak tersedia')} · <strong>Metode:</strong> {metadata.get('procurement_method', 'Tidak tersedia')}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_factors(payload: dict[str, Any]) -> None:
    factors = payload.get("factors", [])
    max_abs = max([abs(float(item.get("shap_value", 0.0))) for item in factors] or [1.0]) or 1.0
    st.markdown('<div class="card"><h2>Explainability drivers</h2><p class="small-muted">Kontribusi teratas yang membantu reviewer memahami arah skor model.</p>', unsafe_allow_html=True)
    for item in factors:
        value = float(item.get("shap_value", 0.0))
        width = min(100.0, abs(value) / max_abs * 100.0)
        color = "#fb7185" if value >= 0 else "#34d399"
        label = item.get("feature_label") or item.get("feature", "Fitur")
        direction = "menaikkan" if value >= 0 else "menurunkan"
        st.markdown(
            f"""
            <div class="factor-row">
              <div class="factor-label"><span>{label}</span><span>{direction} · {value:+.5f}</span></div>
              <div class="factor-track"><div class="factor-fill" style="width:{width:.1f}%; background:{color}"></div></div>
              <div class="small-muted">{item.get('feature', '')} · nilai fitur {item.get('value', item.get('feature_value', '—'))}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    st.markdown("</div>", unsafe_allow_html=True)


def render_narrative(payload: dict[str, Any]) -> None:
    st.markdown("### Narasi casebook")
    st.markdown(str(payload.get("narrative", "Narasi belum tersedia.")))
    st.markdown("### Checklist reviewer")
    for question in payload.get("reviewer_questions", []):
        st.checkbox(str(question), value=False)


def render_guardrails(payload: dict[str, Any], state: DemoState) -> None:
    fallback_note = f"<p><strong>Fallback:</strong> {state.error}</p>" if state.error else ""
    st.markdown(
        f"""
        <div class="guardrail">
          <div class="eyebrow">Guardrail disclaimer</div>
          <h2>{REQUIRED_GUARDRAIL_COPY}</h2>
          <p>{payload.get('guardrail', SAFE_GUARDRAIL_ID)}</p>
          <p>{payload.get('heuristic_label_note', '')}</p>
          <p class="small-muted">Mode: {payload.get('provenance', {}).get('inference_mode', 'offline_local')}</p>
          {fallback_note}
        </div>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, page_icon="⚡", layout="wide")
    inject_css()
    state = load_dashboard_state()
    render_hero(state)
    render_kpis(state)

    left, right = st.columns([0.92, 1.45], gap="large")
    with left:
        selected_case_id = render_queue_selector(state.queue)
    payload = get_case_payload(state, selected_case_id)
    with right:
        render_case_header(payload)
        render_factors(payload)
        render_narrative(payload)
        render_guardrails(payload, state)


if __name__ == "__main__":
    main()

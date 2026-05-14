from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'frontend' / 'src'
FRONTEND_ROOT = ROOT / 'frontend'


def test_frontend_contains_required_safe_copy_and_no_prohibited_verdict_claims():
    combined = '\n'.join(path.read_text(encoding='utf-8') for path in FRONTEND.rglob('*') if path.suffix in {'.ts', '.tsx', '.css'})
    lower = combined.lower()
    for phrase in ('triase risiko', 'prioritas review', 'bukan tuduhan pelanggaran'):
        assert phrase in lower
    blocked_terms = (
        ('terbukti', 'fraud'),
        ('terbukti', 'korupsi'),
        ('fraud', 'final'),
        ('legal', 'verdict'),
        ('confirmed', 'corruption'),
        ('putusan', 'hukum'),
    )
    for phrase in (' '.join(parts) for parts in blocked_terms):
        assert phrase not in lower


def test_frontend_api_client_uses_api_contract_routes_only():
    client = (FRONTEND / 'api' / 'client.ts').read_text(encoding='utf-8')
    assert '/api/demo-state' in client
    assert '/api/queue' in client
    assert '/api/casebook/' in client
    assert '/api/archive' in client
    assert '/api/reviews' in client

def test_vite_dev_proxy_targets_lpse_api_without_colliding_with_gateway():
    """Keep Vite dev /api calls connected while Kiro gateway owns port 8000."""
    vite_config = (FRONTEND_ROOT / 'vite.config.ts').read_text(encoding='utf-8')
    assert 'LPSEX_API_PROXY_TARGET' in vite_config
    assert "'http://127.0.0.1:8888'" in vite_config
    assert "'/api': apiProxyTarget" in vite_config



def test_command_center_uses_archive_monthly_trend_contract_without_client_demo_trend():
    command_center = (FRONTEND / 'pages' / 'CommandCenterPage.tsx').read_text(encoding='utf-8')
    trend_chart = (FRONTEND / 'components' / 'dashboard' / 'RiskTrendChart.tsx').read_text(encoding='utf-8')
    filter_rail = (FRONTEND / 'components' / 'dashboard' / 'FilterRail.tsx').read_text(encoding='utf-8')

    assert "params.set('page_size', String(ARCHIVE_PAGE_SIZE))" in command_center
    assert 'function buildTrend' not in command_center
    assert 'buildTrend(' not in command_center
    assert 'monthly_risk_trend' in command_center
    assert 'Tren Risiko Arsip per Bulan' in trend_chart
    assert 'Demo-' not in trend_chart
    assert 'test_data split' not in filter_rail

from pathlib import Path
import re

import pandas as pd
from fastapi.testclient import TestClient

from src.api import app
from src.product_demo import DEFAULT_FEATURES_PATH

client = TestClient(app)
EXPECTED_HELD_OUT_ROWS = 93034
EXPECTED_TRAIN_ROWS = 372150
EXPECTED_ARCHIVE_ROWS = EXPECTED_HELD_OUT_ROWS + EXPECTED_TRAIN_ROWS


def test_health_returns_offline_guardrail_contract():
    response = client.get('/api/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['mode'] == 'offline_local'
    assert 'triase risiko' in payload['guardrail']
    assert 'prioritas review' in payload['guardrail']
    assert 'bukan tuduhan pelanggaran' in payload['guardrail']


def test_demo_state_is_deterministic_and_build_aware():
    response = client.get('/api/demo-state')
    assert response.status_code == 200
    payload = response.json()
    assert payload['offline_mode'] is True
    assert payload['demo_queue_url'] == '/api/queue?demo=1'
    assert payload['production_build_status']['served_by_fastapi'] is True
    assert payload['production_build_status']['index_html'] == 'frontend/dist/index.html'
    assert payload['golden_path_steps']
    if payload['ready']:
        assert payload['demo_case_id']
        assert payload['casebook_url'].endswith(payload['demo_case_id'])
        assert payload['export_html_url'].endswith('/export.html')
        assert payload['model_artifact'] == 'model_risk.ubj'
        assert payload['feature_source'] == 'test_data/features.parquet'
        assert payload['raw_source'] == 'test_data/raw.parquet'
        status = payload['inference_status']
        expected_rows = len(pd.read_parquet(DEFAULT_FEATURES_PATH))
        assert expected_rows == EXPECTED_HELD_OUT_ROWS
        assert status['model_artifact'] == 'model_risk.ubj'
        assert status['model_backend'] == 'xgboost'
        assert status['inference_mode'] == 'offline_local'
        assert status['source_split'] == 'test_data'
        assert status['feature_source'] == 'test_data/features.parquet'
        assert status['rows_scored'] == EXPECTED_HELD_OUT_ROWS
        assert status['rows_ranked'] == EXPECTED_HELD_OUT_ROWS
        assert status['rows_displayed'] == 50
        assert status['matched_rows'] == EXPECTED_HELD_OUT_ROWS
        assert status['no_cloud_call'] is True
        assert status['no_live_scraping'] is True
        assert status['no_retraining'] is True
        assert status['total_latency_ms'] > 0
        casebook_response = client.get(payload['casebook_url'])
        assert casebook_response.status_code == 200
        casebook_payload = casebook_response.json()
        assert casebook_payload['case_id'] == payload['demo_case_id']
        assert casebook_payload['explanation_brief']['summary']
        assert casebook_payload['explanation_brief']['top_drivers']
        assert casebook_payload['explanation_brief']['reviewer_checklist']
        assert 'SHAP menunjukkan' in casebook_payload['explanation_brief']['shap_note']
        assert 'bukan tuduhan pelanggaran' in casebook_payload['explanation_brief']['safety_note']
    else:
        assert payload['error']


def test_demo_queue_first_item_matches_demo_state_and_filters():
    demo_state = client.get('/api/demo-state').json()
    response = client.get('/api/queue?demo=1&top_n=10')
    assert response.status_code == 200
    payload = response.json()
    assert {'summary', 'distribution', 'trend', 'items', 'guardrail', 'demo_case_id'} <= payload.keys()
    assert payload['items']
    assert len(payload['items']) <= 10
    assert payload['inference_status']['rows_scored'] == EXPECTED_HELD_OUT_ROWS
    assert payload['inference_status']['rows_scored'] > payload['inference_status']['rows_displayed']
    assert payload['inference_status']['rows_displayed'] == len(payload['items'])
    assert payload['items'][0]['risk_rank'] == 1
    assert payload['demo_case_id'] == payload['items'][0]['case_id']
    assert payload['trend']
    assert {'bucket', 'average_priority', 'review_count'} <= payload['trend'][0].keys()
    assert {'month', 'tinggi', 'sedang', 'rendah'}.isdisjoint(payload['trend'][0].keys())
    assert all(not row['bucket'].startswith('Demo-') for row in payload['trend'])
    if demo_state['ready']:
        assert payload['items'][0]['case_id'] == demo_state['demo_case_id']
    search = payload['items'][0]['buyer'][:4]
    filtered = client.get(f'/api/queue?search={search}&risk={payload["items"][0]["predicted_label"]}&top_n=3')
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert len(filtered_payload['items']) <= 3
    if filtered_payload['items']:
        assert filtered_payload['demo_case_id'] == filtered_payload['items'][0]['case_id']


def test_inference_status_endpoint_and_queue_payload_limit():
    response = client.get('/api/inference-status')
    assert response.status_code == 200
    payload = response.json()
    assert payload['model_artifact'] == 'model_risk.ubj'
    assert len(pd.read_parquet(DEFAULT_FEATURES_PATH)) == EXPECTED_HELD_OUT_ROWS
    assert payload['rows_scored'] == EXPECTED_HELD_OUT_ROWS
    assert payload['queue_limit'] == 50

    minimum = client.get('/api/queue?top_n=1')
    assert minimum.status_code == 200
    assert len(minimum.json()['items']) == 1
    assert minimum.json()['inference_status']['queue_limit'] == 1

    maximum = client.get('/api/queue?top_n=500')
    assert maximum.status_code == 200
    assert len(maximum.json()['items']) == 500
    assert maximum.json()['inference_status']['queue_limit'] == 500

    too_small = client.get('/api/queue?top_n=0')
    assert too_small.status_code == 422

    too_large = client.get('/api/queue?top_n=501')
    assert too_large.status_code == 422


def test_dataset_endpoint_pages_full_ai_scored_split_without_dumping_archive():
    response = client.get('/api/dataset?page=1&page_size=12')
    assert response.status_code == 200
    payload = response.json()

    assert payload['total_rows'] == EXPECTED_HELD_OUT_ROWS
    assert payload['matched_count'] == EXPECTED_HELD_OUT_ROWS
    assert payload['page'] == 1
    assert payload['page_size'] == 12
    assert payload['total_pages'] > 7000
    assert len(payload['items']) == 12
    assert payload['items'][0]['risk_rank'] == 1
    assert {'case_id', 'package_title', 'buyer', 'supplier', 'predicted_label', 'risk_priority_score'} <= set(payload['columns'])
    assert {'case_id', 'ocid', 'package_title', 'buyer', 'supplier', 'predicted_label', 'risk_priority_score'} <= set(payload['items'][0])
    assert payload['inference_status']['model_artifact'] == 'model_risk.ubj'
    assert payload['inference_status']['rows_scored'] == EXPECTED_HELD_OUT_ROWS
    assert payload['inference_status']['rows_displayed'] == 12
    assert payload['inference_status']['matched_rows'] == EXPECTED_HELD_OUT_ROWS
    assert payload['inference_status']['queue_limit'] == 12
    assert 'browser tidak menerima arsip penuh' in payload['display_note']
    assert 'bukan tuduhan pelanggaran' in payload['guardrail']

    buyer_prefix = payload['items'][0]['buyer'][:4]
    filtered = client.get(
        '/api/dataset',
        params={
            'page': 1,
            'page_size': 5,
            'risk': payload['items'][0]['predicted_label'],
            'search': buyer_prefix,
        },
    )
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert len(filtered_payload['items']) <= 5
    assert filtered_payload['matched_count'] <= EXPECTED_HELD_OUT_ROWS
    if filtered_payload['items']:
        assert filtered_payload['items'][0]['predicted_label'] == payload['items'][0]['predicted_label']

    final_page = client.get('/api/dataset?page=999999&page_size=12')
    assert final_page.status_code == 200
    final_page_payload = final_page.json()
    assert final_page_payload['page'] == final_page_payload['total_pages']
    assert 0 < len(final_page_payload['items']) <= 12

    assert client.get('/api/dataset?page=0').status_code == 422
    assert client.get('/api/dataset?page_size=101').status_code == 422


def test_archive_endpoint_defaults_to_hundred_rows_and_rejects_oversized_pages():
    response = client.get('/api/archive?page=1')
    assert response.status_code == 200
    payload = response.json()

    assert payload['page_size'] == 100
    assert len(payload['items']) == 100
    assert payload['total_rows'] == EXPECTED_ARCHIVE_ROWS
    assert payload['matched_count'] == EXPECTED_ARCHIVE_ROWS

    oversized = client.get('/api/archive?page_size=101')
    assert oversized.status_code == 422


def test_archive_endpoint_exposes_monthly_trend_date_range_and_derived_buyer_region_contract():
    response = client.get('/api/archive?page=1&page_size=100')
    assert response.status_code == 200
    payload = response.json()

    trend = payload['monthly_risk_trend']
    assert trend, 'monthly_risk_trend must be computed from archive dates, not omitted or mocked'
    assert all(re.fullmatch(r'\d{4}-\d{2}', row['month']) for row in trend)
    assert all(not row['month'].startswith('Demo-') for row in trend)
    assert all({'month', 'tinggi', 'sedang', 'rendah', 'total', 'average_priority'} <= set(row) for row in trend)
    assert all(row['tinggi'] + row['sedang'] + row['rendah'] == row['total'] for row in trend)
    assert all(0 <= row['average_priority'] <= 1 for row in trend)
    assert sum(row['total'] for row in trend) == payload['date_range']['valid_date_rows']

    date_range = payload['date_range']
    assert {'start_month', 'end_month', 'valid_date_rows', 'invalid_date_rows'} <= set(date_range)
    assert re.fullmatch(r'\d{4}-\d{2}', date_range['start_month'])
    assert re.fullmatch(r'\d{4}-\d{2}', date_range['end_month'])
    assert date_range['start_month'] <= date_range['end_month']
    assert date_range['valid_date_rows'] + date_range['invalid_date_rows'] == payload['matched_count']

    first = payload['items'][0]
    assert {'buyer_region', 'buyer_region_type', 'buyer_region_source', 'buyer_region_note'} <= set(first)
    assert first['buyer_region_source'] == 'derived_from_buyer_name'
    assert first['buyer_region_note']
    assert first['buyer_region']
    forbidden_sources = {str(first.get(key, '')) for key in ('buyer_id', 'row_id', 'archive_id', 'ocid', 'tender_id')}
    assert str(first['buyer_region']) not in forbidden_sources


def test_archive_endpoint_pages_full_local_train_and_test_archive_with_split_labels():
    response = client.get('/api/archive?page=1&page_size=12')
    assert response.status_code == 200
    payload = response.json()

    assert payload['total_rows'] == EXPECTED_ARCHIVE_ROWS
    assert payload['matched_count'] == EXPECTED_ARCHIVE_ROWS
    assert payload['archive_scope'] == 'all_local_prepared_data'
    assert payload['heldout_rows'] == EXPECTED_HELD_OUT_ROWS
    assert payload['train_rows'] == EXPECTED_TRAIN_ROWS
    assert payload['split_distribution'] == {'train_data': EXPECTED_TRAIN_ROWS, 'test_data': EXPECTED_HELD_OUT_ROWS}
    assert len(payload['items']) == 12
    first = payload['items'][0]
    assert {'archive_id', 'archive_rank', 'split_risk_rank', 'source_split', 'is_heldout', 'eval_claim_scope'} <= set(first)
    assert {'predicted_label', 'risk_priority_score', 'probability_high'} <= set(first)
    assert first['archive_rank'] == 1
    assert first['archive_id'].startswith(('train_data:', 'test_data:'))
    assert first['source_split'] in {'train_data', 'test_data'}
    assert payload['inference_status']['rows_scored'] == EXPECTED_ARCHIVE_ROWS
    assert payload['inference_status']['train_rows'] == EXPECTED_TRAIN_ROWS
    assert payload['inference_status']['heldout_rows'] == EXPECTED_HELD_OUT_ROWS
    assert payload['inference_status']['no_retraining'] is True
    assert 'Bukti inferensi held-out tetap 93.034' in payload['display_note']
    assert 'bukan tuduhan pelanggaran' in payload['guardrail']

    test_only = client.get('/api/archive?split=test_data&page_size=1').json()
    assert test_only['matched_count'] == EXPECTED_HELD_OUT_ROWS
    assert test_only['split_distribution'] == {'train_data': 0, 'test_data': EXPECTED_HELD_OUT_ROWS}
    assert test_only['items'][0]['source_split'] == 'test_data'
    assert test_only['items'][0]['is_heldout'] is True
    assert test_only['items'][0]['eval_claim_scope'] == 'heldout_test_only'

    train_only = client.get('/api/archive?split=train_data&page_size=1').json()
    assert train_only['matched_count'] == EXPECTED_TRAIN_ROWS
    assert train_only['split_distribution'] == {'train_data': EXPECTED_TRAIN_ROWS, 'test_data': 0}
    assert train_only['items'][0]['source_split'] == 'train_data'
    assert train_only['items'][0]['is_heldout'] is False
    assert train_only['items'][0]['eval_claim_scope'] == 'archive_browsing_only'

    status = client.get('/api/inference-status').json()
    assert status['model_artifact'] == 'model_risk.ubj'
    assert status['source_split'] == 'test_data'
    assert status['rows_scored'] == EXPECTED_HELD_OUT_ROWS
    assert status['rows_ranked'] == EXPECTED_HELD_OUT_ROWS
    assert status['feature_source'] == 'test_data/features.parquet'
    assert status['no_cloud_call'] is True
    assert status['no_live_scraping'] is True
    assert status['no_retraining'] is True
    assert 'archive_scope' not in status


def test_archive_analytics_endpoint_returns_bounded_judge_safe_contract():
    response = client.get('/api/archive/analytics?sort=risk_desc')
    assert response.status_code == 200
    payload = response.json()

    assert {
        'filters',
        'counts',
        'priority_map',
        'priority_map_meta',
        'regional_concentration',
        'regional_meta',
        'buyer_concentration',
        'buyer_meta',
        'coverage_proof',
        'monthly_trends',
        'donut',
        'display_note',
        'guardrail',
    } <= set(payload)
    assert payload['filters']['sort'] == 'risk_desc'
    assert payload['counts']['total_rows'] == EXPECTED_ARCHIVE_ROWS
    assert payload['counts']['matched_count'] == EXPECTED_ARCHIVE_ROWS
    assert payload['priority_map_meta']['point_limit'] == 500
    assert len(payload['priority_map']) <= 500
    assert payload['priority_map_meta']['points_returned'] == len(payload['priority_map'])
    assert payload['priority_map_meta']['sample_strategy'] == 'balanced_120_per_risk_tier_plus_top_140_by_positive_contract_value'
    assert payload['priority_map_meta']['is_capped'] is True
    assert {'Risiko Tinggi', 'Risiko Sedang', 'Risiko Rendah'} <= {point['risk_label'] for point in payload['priority_map']}
    first = payload['priority_map'][0]
    assert {
        'archive_id',
        'case_id',
        'source_split',
        'is_heldout',
        'eval_claim_scope',
        'title',
        'buyer',
        'supplier',
        'region',
        'risk_label',
        'filter_value',
        'risk_score',
        'probability_high',
        'contract_value',
        'tender_value_display',
        'filtered_rank',
        'archive_page',
    } <= set(first)
    assert first['archive_page'] == ((first['filtered_rank'] - 1) // 100) + 1
    assert first['filter_value'] in {'Risiko Tinggi', 'Risiko Sedang', 'Risiko Rendah'}
    assert payload['regional_meta']['limit'] == 12
    assert payload['buyer_meta']['limit'] == 12
    assert len(payload['regional_concentration']) <= 12
    assert len(payload['buyer_concentration']) <= 12
    assert 'derived from buyer name' in payload['regional_meta']['note']
    assert payload['coverage_proof']['no_cloud_call'] is True
    assert payload['coverage_proof']['no_live_scraping'] is True
    assert payload['coverage_proof']['no_retraining'] is True
    assert 'triase risiko' in payload['display_note']
    assert 'bukan tuduhan pelanggaran' in payload['display_note']


def test_archive_analytics_filters_match_archive_and_empty_shape_is_stable():
    filtered = client.get(
        '/api/archive/analytics',
        params={
            'risk': 'Risiko Tinggi',
            'split': 'test_data',
            'search': 'unlikely-no-match-lpse-x',
            'sort': 'value_desc',
        },
    )
    assert filtered.status_code == 200
    payload = filtered.json()

    assert payload['filters']['risk'] == 'Risiko Tinggi'
    assert payload['filters']['split'] == 'test_data'
    assert payload['filters']['search'] == 'unlikely-no-match-lpse-x'
    assert payload['filters']['sort'] == 'value_desc'
    assert payload['counts']['matched_count'] == 0
    assert payload['priority_map'] == []
    assert payload['regional_concentration'] == []
    assert payload['buyer_concentration'] == []
    assert payload['monthly_trends'] == []
    assert [segment['filter_value'] for segment in payload['donut']] == ['Risiko Tinggi', 'Risiko Sedang', 'Risiko Rendah']
    assert all(segment['count'] == 0 for segment in payload['donut'])
    assert payload['priority_map_meta']['point_limit'] == 500
    assert payload['priority_map_meta']['points_returned'] == 0
    assert payload['coverage_proof']['filtered_train_rows'] == 0
    assert payload['coverage_proof']['filtered_heldout_rows'] == 0


def test_api_surfaces_share_one_cached_inference_metadata_contract():
    demo = client.get('/api/demo-state').json()
    status = client.get('/api/inference-status').json()
    queue = client.get('/api/queue?top_n=7').json()
    dataset = client.get('/api/dataset?page_size=4').json()

    assert demo['ready'], demo.get('error')
    demo_status = demo['inference_status']
    queue_status = queue['inference_status']
    dataset_status = dataset['inference_status']
    for payload in (demo_status, status, queue_status, dataset_status):
        assert payload['generated_at'] == status['generated_at']
        assert payload['model_artifact'] == 'model_risk.ubj'
        assert payload['feature_source'] == 'test_data/features.parquet'
        assert payload['rows_scored'] == EXPECTED_HELD_OUT_ROWS
        assert payload['no_cloud_call'] is True
        assert payload['no_live_scraping'] is True
        assert payload['no_retraining'] is True

    assert demo_status['rows_displayed'] == 50
    assert status['rows_displayed'] == 50
    assert queue_status['rows_displayed'] == 7
    assert queue_status['queue_limit'] == 7
    assert dataset_status['rows_displayed'] == 4
    assert dataset_status['queue_limit'] == 4


def test_casebook_and_selected_export_html_contract():
    demo_state = client.get('/api/demo-state').json()
    assert demo_state['ready'], demo_state.get('error')
    case_id = demo_state['demo_case_id']
    payload = client.get(f'/api/casebook/{case_id}').json()
    assert payload['case_id'] == case_id
    assert payload['metadata']
    assert payload['model_output']['risk_rank'] == 1
    assert payload['factors']
    assert payload['narrative']
    assert payload['reviewer_questions']
    assert 'bukan tuduhan pelanggaran' in payload['guardrail']
    assert payload['provenance']['inference_mode'] == 'offline_local'

    response = client.get(f'/api/casebook/{case_id}/export.html')
    assert response.status_code == 200
    assert 'text/html' in response.headers['content-type']
    html = response.text
    assert case_id.split(':')[0] in html
    assert 'model_risk.ubj' in html
    assert 'Top Risk Factors' in html
    assert 'Reviewer Checklist' in html
    assert 'bukan tuduhan pelanggaran' in html


def test_static_casebook_status_is_not_primary_export():
    response = client.get('/api/static-casebook')
    assert response.status_code == 200
    payload = response.json()
    assert payload['path'] == 'demo_casebook.html'
    assert payload['primary_export'] is False


def test_api_does_not_mutate_model_artifacts():
    artifacts = [Path('model_risk.ubj'), Path('model_risk.onnx')]
    before = {path: path.stat().st_mtime_ns for path in artifacts}
    client.get('/api/demo-state')
    client.get('/api/queue?demo=1&top_n=2')
    client.get('/api/dataset?page_size=2')
    client.get('/api/archive?page_size=2')
    after = {path: path.stat().st_mtime_ns for path in artifacts}
    assert after == before

from fastapi.testclient import TestClient

from backend.api import app

client = TestClient(app)


def test_spa_routes_return_html_when_dist_exists_after_build():
    response = client.get('/')
    if response.status_code == 404:
        assert response.json()['error'] == 'frontend_dist_missing'
        return
    spa_routes = [
        '/',
        '/home',
        '/?demo=1',
        '/dashboard',
        '/dashboard/overview',
        '/dashboard/archive',
        '/dashboard/analytics',
        '/dashboard/locations',
        '/dashboard/activity',
        '/reports',
        '/settings',
        '/help',
        '/command-center',
        '/casebook/demo-id',
        '/model-transparency',
        '/unknown-route',
    ]
    for route in spa_routes:
        route_response = client.get(route)
        assert route_response.status_code == 200
        assert 'text/html' in route_response.headers['content-type']
        assert '<div id="root"></div>' in route_response.text


def test_api_routes_are_not_swallowed_by_spa_fallback():
    assert client.get('/api/health').headers['content-type'].startswith('application/json')
    assert client.get('/api/demo-state').headers['content-type'].startswith('application/json')
    assert client.get('/api/queue?top_n=1').headers['content-type'].startswith('application/json')
    demo_state = client.get('/api/demo-state').json()
    if demo_state['ready']:
        case_id = demo_state['demo_case_id']
        assert client.get(f'/api/casebook/{case_id}').headers['content-type'].startswith('application/json')
        assert 'text/html' in client.get(f'/api/casebook/{case_id}/export.html').headers['content-type']


def test_unknown_api_route_returns_json_404_not_spa():
    response = client.get('/api/not-a-real-route')
    assert response.status_code == 404
    assert response.headers['content-type'].startswith('application/json')

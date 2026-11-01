import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app, get_osrm, get_roads
from backend.models.route import ErrorResponse, RouteRequest, RouteResult
from backend.intelligence.road_analyzer import RoadIndex
from backend.osrm.client import OSRMError
from backend.osrm.route_generator import parse_routes
from scripts.export_contracts import render_openapi

ROOT = Path(__file__).resolve().parents[1]


def test_openapi_snapshot_matches_current_app():
    assert (ROOT / 'contracts/openapi.json').read_text(encoding='utf-8') == render_openapi()


def test_contract_check_detects_stale_snapshot(tmp_path):
    output = tmp_path / 'openapi.json'
    output.write_text('{}\n')
    result = subprocess.run([sys.executable, '-m', 'scripts.export_contracts', '--check',
                             '--output', str(output)], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 1
    assert 'out of date' in result.stdout


@pytest.mark.parametrize('name', ['success', 'no-route', 'rejected', 'service-failure'])
def test_shared_fixture_matches_live_api(name):
    fixture = json.loads((ROOT / f'contracts/fixtures/{name}.json').read_text(encoding='utf-8'))
    assert fixture['data_source'] == 'synthetic'
    RouteRequest.model_validate(fixture['request'])
    model = RouteResult if fixture['status_code'] == 200 else ErrorResponse
    model.model_validate(fixture['response'])
    class FixtureOSRM:
        def routes(self, start, end):
            if name == 'service-failure':
                raise OSRMError('fixture service unavailable')
            if name == 'no-route':
                return []
            return parse_routes(json.loads((ROOT / 'examples/osrm-demo-response.json').read_text()))
    app.dependency_overrides[get_osrm] = FixtureOSRM
    app.dependency_overrides[get_roads] = lambda: RoadIndex.load(ROOT / 'data/road_network/demo.json')
    try:
        with TestClient(app) as client:
            response = client.post(fixture['path'], json=fixture['request'])
        assert response.status_code == fixture['status_code']
        actual = response.json()
        if 'classical_runtime_ms' in actual:
            actual['classical_runtime_ms'] = 0
        assert actual == fixture['response']
    finally:
        app.dependency_overrides.clear()

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.main import app, get_osrm, get_roads
from backend.models.route import Location
from backend.osrm.client import OSRMClient, OSRMError
from test_routing import index, payload, request


@pytest.fixture
def api():
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=payload()))) as http:
        app.dependency_overrides[get_osrm] = lambda: OSRMClient(http)
        app.dependency_overrides[get_roads] = index
        with TestClient(app) as client:
            yield client
    app.dependency_overrides.clear()


def test_route_and_block_api(api):
    body = request().model_dump()
    initial = api.post("/api/emergency/route", json=body)
    assert initial.status_code == 200
    assert initial.json()["classical_route"]["id"] == "osrm-0"
    blocked = api.post("/api/emergency/block-road", json={"route_request": body, "segment_ids": ["1:2"]})
    assert blocked.status_code == 200
    assert blocked.json()["classical_route"]["id"] == "osrm-1"
    # A simulation never mutates the next independent request.
    assert api.post("/api/emergency/route", json=body).json()["classical_route"]["id"] == "osrm-0"


def test_validation_and_documentation(api):
    assert api.post("/api/emergency/route", json={}).status_code == 422
    assert api.post("/api/emergency/route", json={}).json()["error"]["code"] == "VALIDATION_ERROR"
    assert api.get("/openapi.json").status_code == 200
    assert api.get("/health").json()["routing_readiness"] == "not_checked"


def test_upstream_failure_returns_503(api):
    def unavailable():
        raise OSRMError("Do not expose this internal message")
    app.dependency_overrides[get_osrm] = unavailable
    response = api.post("/api/emergency/route", json=request().model_dump())
    assert response.status_code == 503
    assert "internal" not in response.text


def test_osrm_parameters_and_coordinate_order():
    calls = []
    def handler(req):
        calls.append(req)
        return httpx.Response(200, json=payload())
    point = Location(latitude=9.93, longitude=76.26)
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = OSRMClient(http)
        assert len(client.routes(point, point)) == 2
        client.nearest(point)
        client.table(point, point)
    assert calls[0].url.path.endswith("76.26,9.93;76.26,9.93")
    assert calls[0].url.params["annotations"] == "nodes,distance,duration"
    assert calls[0].url.params["overview"] == "full"
    assert "/nearest/" in calls[1].url.path
    assert "/table/" in calls[2].url.path


@pytest.mark.parametrize("status, data", [(200, {"code": "NoRoute"}), (400, {"code": "NoRoute"})])
def test_no_route_is_normal_result(status, data):
    point = Location(latitude=9.93, longitude=76.26)
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(status, json=data))) as http:
        assert OSRMClient(http).routes(point, point) == []


@pytest.mark.parametrize("data", [{"code": "Ok"}, {"code": "Ok", "routes": [{}]}, []])
def test_invalid_upstream_data(data):
    point = Location(latitude=9.93, longitude=76.26)
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=data))) as http:
        with pytest.raises(OSRMError):
            OSRMClient(http).routes(point, point)


def test_map_config_and_frontend_assets(api):
    config = api.get('/api/map-config')
    assert config.status_code == 200
    assert config.json()['tile_url'].startswith('https://tile.openstreetmap.org/')
    home = api.get('/')
    assert home.status_code == 200
    assert 'id="map"' in home.text
    assert api.get('/assets/app.js').status_code == 200
    assert api.get('/assets/vendor/leaflet/leaflet.js').status_code == 200
    assert api.get('/api/emergency/route').status_code == 405


def test_readiness_is_not_process_health(api):
    class Probe:
        def nearest(self, point):
            return {"code": "Ok", "waypoints": [{"location": [76.2673, 9.9312]}]}
    app.dependency_overrides[get_osrm] = Probe
    result = api.get('/api/readiness')
    assert result.status_code == 200
    assert result.json()['osrm'] == 'available'
    class Missing:
        def nearest(self, point):
            raise OSRMError('missing')
    app.dependency_overrides[get_osrm] = Missing
    assert api.get('/api/readiness').json()['osrm'] == 'unavailable'


def test_readiness_rejects_malformed_probe(api):
    class Probe:
        def nearest(self, point):
            return {"code": "Ok", "waypoints": []}
    app.dependency_overrides[get_osrm] = Probe
    assert api.get('/api/readiness').json()['osrm'] == 'unavailable'


def test_unbuilt_frontend_has_setup_instructions(api, monkeypatch, tmp_path):
    monkeypatch.setattr('backend.main.FRONTEND_DIST', tmp_path)
    response = api.get('/')
    assert response.status_code == 503
    assert 'Build the map frontend' in response.text


def test_invalid_tile_configuration_is_rejected(api, monkeypatch):
    monkeypatch.setenv('MAP_TILE_URL', 'javascript:alert(1)')
    response = api.get('/api/map-config')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'MAP_CONFIG_INVALID'

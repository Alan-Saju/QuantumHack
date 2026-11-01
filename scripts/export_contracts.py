"""Export or verify the deterministic API snapshot and synthetic routing fixtures."""
import argparse
import json
from pathlib import Path

from backend.main import app
from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import APIError, ErrorResponse, RouteRequest
from backend.optimization.classical_optimizer import optimize
from backend.osrm.route_generator import parse_routes

ROOT = Path(__file__).resolve().parents[1]


def render_json(value) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def render_openapi() -> str:
    return render_json(app.openapi())


def render_fixtures() -> dict[str, str]:
    roads = RoadIndex.load(ROOT / 'data/road_network/demo.json')
    raw = json.loads((ROOT / 'examples/osrm-demo-response.json').read_text(encoding='utf-8'))
    candidates = parse_routes(raw)
    base_request = RouteRequest(
        ambulance={'latitude': 9.9312, 'longitude': 76.2673},
        emergency={'latitude': 9.932, 'longitude': 76.2691},
        optimization={'consider_traffic': False, 'consider_road_width': False, 'consider_risk': False},
        scenario={'seed': 0, 'overrides': {segment_id: 'low' for segment_id in roads.edges}},
    )
    fixtures = {}
    for name in ['success', 'no-route', 'rejected', 'service-failure']:
        request = base_request.model_copy(deep=True)
        if name == 'rejected':
            request.scenario.overrides = {segment_id: 'blocked' for segment_id in roads.edges}
        if name == 'service-failure':
            response = ErrorResponse(error=APIError(code='OSRM_UNAVAILABLE',
                message='Local OSRM is unavailable or returned invalid routing data.')).model_dump(exclude_none=True)
        else:
            response = optimize([] if name == 'no-route' else candidates, roads, request).model_dump(mode='json')
            response['classical_runtime_ms'] = 0  # A fixed fixture has no measured runtime.
        fixtures[name] = render_json({'data_source': 'synthetic',
            'description': 'Offline contract fixture, not surveyed road data or a live OSRM result. Runtime is fixed to zero.',
            'method': 'POST', 'path': '/api/emergency/route',
            'status_code': 503 if name == 'service-failure' else 200,
            'request': request.model_dump(mode='json'), 'response': response})
    return fixtures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if a snapshot or fixture is absent or stale')
    parser.add_argument('--output', type=Path, default=ROOT / 'contracts/openapi.json', help='Schema output path')
    args = parser.parse_args()
    outputs = {args.output: render_openapi()}
    outputs.update({ROOT / f'contracts/fixtures/{name}.json': content for name, content in render_fixtures().items()})
    stale = []
    for path, expected in outputs.items():
        if args.check:
            if not path.is_file() or path.read_text(encoding='utf-8') != expected:
                stale.append(path.name)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected, encoding='utf-8', newline='\n')
    if stale:
        print('API contracts are out of date: ' + ', '.join(stale))
        print('Run python -m scripts.export_contracts and include the changes in your pull request.')
        return 1
    print('API snapshot and four synthetic fixtures ' + ('match.' if args.check else 'exported.'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

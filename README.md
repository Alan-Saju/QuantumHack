# QuantumRescue

Research prototype for ambulance route comparison in Kochi. OSRM supplies road-network routes; Python scores alternatives using road attributes, deterministic simulated congestion, and vehicle constraints.

The initial implementation covers the Python work for phases 1–3 of [the implementation plan](QuantumRescue_Implementation_Plan.md). OSRM infrastructure is supplied but needs Docker and map preparation on the host. QUBO, QAOA, exact graph optimization and the dashboard are later phases.

## Quick start

Commands below run in PowerShell from the repository root. The existing environment uses Python 3.14.4; dependencies were installed and tested there. For a new environment:

```powershell
python -m venv qiskit-env
.\qiskit-env\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
.\qiskit-env\Scripts\python.exe -m pytest -q
.\qiskit-env\Scripts\python.exe -m scripts.offline_demo
```

The offline demo uses synthetic routes, node IDs and attributes. It prints a preferred route and an alternative selected after a closure. It does not call OSRM and is not evidence of routing on actual Kochi roads.

## Phase 1: local OSRM

1. Install Docker Desktop with its Linux container engine and start it.
2. Place a Kochi/Kerala `.osm.pbf` extract at `osrm/data/map.osm.pbf`. The same file must supply both OSRM and the attribute index.
3. Prepare and start the routing service:

```powershell
.\osrm\prepare.ps1
```

Alternatively, ` .\osrm\prepare.ps1 -DownloadKerala` downloads the **full Kerala extract** from Geofabrik before preprocessing. A small Kochi extract is preferable for memory and preparation time. Downloads and generated OSRM files are ignored by Git. The extract's OpenStreetMap/ODbL attribution and licensing requirements still apply.

The script stops on failure, then runs `extract → partition → customize → routed` using the pinned `osrm/osrm-backend:v5.27.1` image. The Lua profile inherits OSRM's standard car profile and sets left-hand driving for Kochi; it grants no emergency exemptions. Profile changes require reprocessing. The service binds only to `127.0.0.1:5000`.

Build the attribute index, then check all three OSRM services:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.build_road_index osrm/data/map.osm.pbf data/road_network/roads.json
.\qiskit-env\Scripts\python.exe -m scripts.check_osrm
```

The check exercises Route, Nearest and Table with Kochi coordinates. OSRM may return only one route even when alternatives are requested. The supplied coordinates may need adjustment to the coverage of your extract. Snapping is capped at 100 m in route requests.

Stop OSRM with:

```powershell
docker compose -f osrm/docker-compose.yml down
```

## Phases 2–3: scoring and classical API

```powershell
$env:OSRM_BASE_URL = 'http://127.0.0.1:5000'
$env:ROAD_INDEX_PATH = (Resolve-Path data/road_network/roads.json).Path
.\qiskit-env\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open [interactive API documentation](http://127.0.0.1:8000/docs). In another terminal:

```powershell
$body = Get-Content examples/route-request.json -Raw
$result = Invoke-RestMethod http://127.0.0.1:8000/api/emergency/route -Method Post -ContentType 'application/json' -Body $body
$result | ConvertTo-Json -Depth 30
```

Implemented endpoints:

- `GET /health`: process health, explicitly does not claim OSRM readiness.
- `POST /api/emergency/route`: generate, score, validate and rank candidates.
- `POST /api/emergency/simulate-traffic`: same request schema; recalculate with the supplied `scenario`.
- `POST /api/emergency/block-road`: accepts `{"route_request": <route request>, "segment_ids": ["source_osm_node:target_osm_node"]}` and recalculates with those directed segments blocked.

Requests are stateless and repeatable: no route IDs, persistent results or global mutable traffic state. Segment IDs come from the result's `candidates[].segments`. A closure affects only listed directions; supply both directed IDs for a two-way closure. Segment IDs absent from current candidates have no effect. API simulation state does not alter OSRM's routing graph, so a closure can eliminate every returned alternative rather than discover a new path.

The response includes all candidates, segment attributes and simulated traffic, rejection reasons, uncertainty warnings, weighted cost components, runtime, selected route and the original OSRM recommendation as a fallback **only if it passes validation**. If every candidate is rejected, both selected route and fallback are null with `status: no_feasible_route`. Service failures return 503; invalid input returns 422. Quantum algorithm requests are rejected by validation until implemented. Route storage/retrieval and comparison endpoints in the plan are deferred.

### Road enrichment and restrictions

`build_road_index` preserves highway way tags and indexes each consecutive directed OSM node pair. The route parser requests full GeoJSON geometry and OSRM node/distance/duration annotations. It rejects misaligned arrays rather than guessing edge identities. No coordinate-nearest matching or name matching is used. Missing matches and parallel ways sharing the same node pair stay unknown.

The validator excludes simulated closures, known one-way violations, prohibited access and vehicles exceeding parsed width/height/weight limits. These checks remain active when optional scoring factors are disabled. Vehicle dimensions are required to be positive; demo defaults are width 2.4 m, height 2.8 m and weight 3.5 t, and should be supplied explicitly for another vehicle.

Missing width is returned as null. `require_known_width: true` rejects it; otherwise the demo permits it with explicit warnings and an experimental suitability penalty. Only simple metric values are parsed (`3.5`, `3.5 m`, `3.5 t`); other formats and conditional restrictions remain uninterpreted and are warned about. Node barriers, turning clearance, obstacles, complex conditional/access exemptions and independent validation of OSRM turn restrictions are not implemented. Nominal width does not establish usable clearance. `feasible` means passing these limited checks, never certified emergency suitability. If `ROAD_INDEX_PATH` is unset, all attributes remain unknown; a configured missing or invalid file fails rather than silently using demo data. Restart the API after replacing the index.

### Traffic and cost

Each directed segment gets a stable SHA-256-derived low/medium/high level from `scenario.seed` and its ID. Explicit `scenario.overrides` may set `low`, `medium`, `high` or `blocked`. Values are included per segment in each response. This is **simulated traffic**, frozen for a request, not live or time-dependent traffic prediction.

Speed factors are 1.0, 0.65 and 0.35. Predicted time scales OSRM segment duration by the inverse factor and preserves the route's remaining turn time. All score components use experimental seconds-equivalent penalties:

- travel time: predicted segment time plus remaining OSRM turn time;
- congestion: added seconds from simulated traffic;
- suitability: 30 seconds per segment with unknown width;
- risk: half the baseline duration on unpaved/gravel/ground/sand/mud segments.

The objective is `weights.time * travel_time + weights.congestion * congestion + weights.suitability * suitability + weights.risk * risk`. Defaults are 1, 0, 1, 1. Congestion already increases travel time; its separate weight defaults to zero to avoid counting the same delay twice. Weights can be configured in each request. Penalties and scores depend on graph segmentation and are starting assumptions, not calibrated operational estimates.

Ranking OSRM alternatives does not prove a globally optimal path under custom costs. OSRM's standard recommendation is subject to the same checks as every other candidate.

## Verification and project layout

- `backend/osrm/`: HTTP client and validated candidate decoding.
- `backend/intelligence/`: OSM lookup, deterministic traffic and cost calculation.
- `backend/optimization/`: restriction validation and classical candidate ranking.
- `backend/models/route.py`: request and result contracts.
- `tests/`: cost, restrictions, road extraction, OSRM response handling and API integration tests.
- `scripts/`: OSM extraction, offline demo and real OSRM smoke check.

The automated suite mocks OSRM HTTP responses but performs actual FastAPI requests and actual extraction from a small OSM XML fixture. Live OSRM preprocessing and routing must be checked with `scripts.check_osrm` after Docker is installed. `/health` alone is insufficient. The pinned dependency snapshot is in `requirements.txt`.

## Sources

- [OSRM API: alternatives, annotations and coordinate order](https://project-osrm.org/docs/v5.24.0/api/)
- [OSRM preprocessing workflow](https://github.com/Project-OSRM/osrm-backend#quick-start)
- [FastAPI testing and dependency injection](https://fastapi.tiangolo.com/tutorial/testing/)
- [Pyosmium handler lifecycle](https://docs.osmcode.org/pyosmium/latest/reference/Handler-Processing/)
- [HTTPX mock transports](https://www.python-httpx.org/advanced/transports/#mock-transports)

This is a research demonstration, not an emergency dispatch system. Real use requires authoritative data and operational validation as described in the implementation plan.

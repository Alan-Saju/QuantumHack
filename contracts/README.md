# Shared API contract

The allocation endpoints are included in the generated OpenAPI contract:
`GET /api/allocation/demo` and `POST /api/allocation/optimize`. The first supplies
the editable three-resource scenario. The second returns exact and QAOA results,
QUBO variable order and upper-triangular coefficients, and explicit data-source
and fallback labels. Allocation uses the real local backend in browser tests;
the Node-only mock runner below covers the original route inspector only.

`openapi.json` is generated from FastAPI and its Pydantic models. Both
developers should use it to coordinate request and response changes.
`fixtures/` contains **synthetic** POST `/api/emergency/route` examples for
success with alternatives, no route, rejected candidates, and OSRM failure.

Each fixture is an envelope: `request` is the POST body, `response` is the
JSON response body, and `status_code` is the HTTP status. Do not send the
envelope itself to the API. The `data_source` and `description` fields mark
test data; they are not additional fields in the live response contract.
Fixture runtime is fixed at zero. No fixture represents surveyed roads or
measured performance. Browser tests may reposition synthetic geometry to
follow changed inputs; its coordinates are not live routes.

Generate the schema and fixtures from the repository root:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts
```

Verify the checked-in files match the implementation:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts --check
.\qiskit-env\Scripts\python.exe -m pytest tests/test_contracts.py -q
```

An API change must include regenerated files and updated consumers/tests in
the same pull request. Discuss breaking changes before implementation.
`tests/test_contracts.py` validates fixture models, replays fixtures through
the real FastAPI handlers with an injected OSRM provider, and checks for
schema drift. These checks need no live OSRM service. Browser tests consume
these same fixtures. The frontend runner also serves their exact status and
response bodies in explicit mock mode:

```powershell
npm.cmd --prefix frontend ci --ignore-scripts
npm.cmd --prefix frontend run dev:mock
```

Open `http://127.0.0.1:5173/`. Set `MOCK_SCENARIO` to `success` (default),
`no-route`, `rejected`, or `service-failure` before starting the runner.
It serves fixed example geometry regardless of the submitted coordinates;
it is a UI development tool, not a routing simulator or request validator.
Only the route endpoint, map configuration and explicitly synthetic readiness
are mocked. Unknown endpoints return 404; incorrect route methods return 405.
The persistent banner and route status identify synthetic results.

`npm.cmd --prefix frontend run dev` instead forwards `/api/` to
`BACKEND_TARGET` (default `http://127.0.0.1:8000`). Live forwarding preserves
backend response statuses and bodies. A connection failure returns 503 with
`error.code: BACKEND_UNAVAILABLE`, a runner error rather than a FastAPI response.
Live mode never substitutes fixtures. Both modes bind only to `127.0.0.1`.

## Road-cost additions

`quantum.plan_valid` is set by independent allocation-service validation. A
completed QAOA sample may be valid and worse than the full exact optimum; in that
case `quantum.assignments` is preserved for comparison, while the recommended
top-level `assignments` still contains the Classical plan. The UI runs both
solvers once with `solver.algorithm: qaoa` and switches locally between
`exact_assignments` and the validated `quantum.assignments`. It uses the same
scenario snapshot/time in both views. No extra optimization request occurs.
Unavailable or invalid quantum results cannot be displayed as a QAOA plan.

Allocation ambulances accept positive `width_m`, `height_m`, `weight_t` with
demo defaults 2.4, 2.8, 3.5. Optional `require_known_width` and `consider_traffic`
default to false. `road_scenario` accepts the same bounded seed/overrides object
as route requests; blocked segments are excluded regardless of traffic scoring.
These fields are applied only in OSRM mode. Synthetic responses have no road
coverage or attribute penalties and remain independent of road-index loading.

Existing `legs`, `response_minutes`, `transport_minutes`, and `cost` remain.
Assignment `leg_details` follows response/hospital order and adds each leg's
geometry, cost, road coverage and summarized warnings. Coverage includes segment
counts and seconds of unknown width/surface. `traffic_source` is `none` or
`simulated`; no live traffic feed is implied. Missing width/surface contributes
uncertainty in permissive mode; strict width excludes the route.

Cost adds `narrowness_exposure_s`, `surface_exposure_s`,
`uncertainty_exposure_s` and `uncertainty_penalty_s`. `suitability_penalty_s`
now means 0.5 times narrowness exposure, replacing the old per-edge unknown-width
penalty; `risk_penalty_s` is 0.3 times surface exposure, a preference rather
than measured medical risk. `weights.uncertainty` defaults to one.
Default total is `T + 0.5*N + 0.3*S + 0.2*U`; ETA remains `travel_time_s`.
Route responses also include `road_coverage`. This changes scoring/ranking
intentionally; regenerated schemas and fixtures describe the current behavior.

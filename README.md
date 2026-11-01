# QuantumRescue

QuantumRescue is a local research prototype for allocating ambulances to incidents
and hospital receiving slots across Kerala. It compares an exact Classical solver
with local Qiskit QAOA simulation, using the same resource constraints and costs.
The map also includes a route inspector and an OpenStreetMap hospital picker.

This is a research demonstration. Care capabilities, receiving slots, severity
policy and vehicle profiles are configurable demo assumptions. No operational
medical dispatch, live traffic feed or quantum advantage is claimed.

## What you can do

- Place up to three ambulances and three incidents on the map.
- Configure vehicle dimensions, incident severity/care requirements and hospital availability.
- Run Classical and QAOA once, then switch their saved maps and data without recalculating.
- Inspect each ambulance's response and hospital journey, ETA and road-cost breakdown.
- Collapse **Scenario** to give the map more space; use **Show Scenario** to restore it.
- Use synthetic travel immediately, or local OSRM for actual road geometry and travel time.
- Replace hospital slots using a locally extracted OpenStreetMap hospital catalogue.

The map operates within a rectangle covering Kerala, with margin: latitude
8.15–12.90 and longitude 74.40–77.80. This is not an exact state-boundary polygon.
The default scenario opens around the configured Kochi resources.

## 1. Prerequisites

The main setup below is for **Windows and PowerShell**.

Install:

- [Python 3.14](https://www.python.org/downloads/windows/) — choose the 3.14 series,
  matching the project's tested environment and CI.
- [Node.js 22 or newer, including npm](https://nodejs.org/en/download).
- [Git](https://git-scm.com/install/windows) if cloning the repository.
- A current browser. Automated Windows browser checks use installed Microsoft Edge.

For **real road routing only**, also install
[Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
and enable its Linux container engine. Synthetic allocation does not need Docker.

Check your tools in a new PowerShell window:

```powershell
py -3.14 --version
node --version
npm.cmd --version
git --version
```

No IBM account, API key or quantum hardware is required. QAOA runs locally in a
noiseless statevector simulator.

## 2. Install and start the synthetic demo

Clone the repository, or skip the first two commands if you already have the
project folder. Use the branch containing the version you want to run; see
[CONTRIBUTING.md](CONTRIBUTING.md) for the shared development workflow.

```powershell
git clone https://github.com/Alan-Saju/QuantumHack.git
cd QuantumHack

py -3.14 -m venv qiskit-env
.\qiskit-env\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
.\qiskit-env\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-quantum.txt
npm.cmd --prefix frontend ci --ignore-scripts

.\scripts\start.ps1
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

The launcher builds the frontend and starts FastAPI on port 8000. Python environment
activation is optional because the commands use its executable explicitly.
Use `-Port 8001` to choose another port and `-NoReload` to disable backend auto-reload.
Press Ctrl+C in the launcher's terminal to stop the API.

The quantum dependency file is optional for Classical-only API use. If it is
omitted, the UI reports QAOA as unavailable and keeps the Classical result available.
Background map tiles need internet, even when allocation uses synthetic travel.

### Manual startup

Use this if you prefer to build and start the server yourself:

```powershell
npm.cmd --prefix frontend run build
.\qiskit-env\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

On macOS/Linux, create `qiskit-env` with Python 3.14 and use
`qiskit-env/bin/python` and `npm` in the equivalent commands. The PowerShell
launcher and OSRM preparation scripts are Windows setup helpers; use the manual
API commands and Docker's OSRM workflow on other systems.

## 3. Use the allocation workspace

1. Choose **Synthetic travel estimates** for a demo, or **Local OSRM road routes**
   after completing road setup below.
2. Position ambulances/incidents by clicking the map, dragging their markers or
   editing coordinates. Hospital coordinates can be selected through the hospital picker.
3. Set incident severity/care requirements, vehicle availability and hospital slots.
   Select Traveller/Omini demo profiles or edit the routing dimensions.
4. Click **Optimize allocation**. One request runs QAOA and the exact Classical comparison.
5. Use **Classical / QAOA** on the map to change the displayed solver. Routes,
   assignments, costs, served incidents, runtime, fleet snapshots, trip details
   and model details all follow that solver, without another optimization request.
6. Select an ambulance to inspect its assigned journey. **Back to dashboard**
   returns to the overview; the solver switch also works while inspecting a trip.

The first displayed plan is the recommended result. A valid QAOA sample remains
viewable even if its cost is worse than Classical. Invalid/unavailable QAOA output
has a disabled button with an explanation; a Classical plan is never relabelled QAOA.
If both solvers return identical assignments, the app explicitly explains why the
routes and cost stay the same. Runtime and solver details still follow the view.

Editing the scenario clears both saved views. Run Optimize again for the new inputs.
Collapsing/expanding Scenario preserves inputs and the saved run.

The three initial hospital names are Sunrise Hospital, Gautham Hospital and Aster
Medicity. Their current coordinates are defined in `backend/allocation/scenario.py`.
Treat locations as configured demo inputs, not verified ambulance entrances.
New map-picker selections start with the receiving slot **off** until you configure
capabilities and availability. The catalogue supplies locations, not clinical data.

## 4. Set up real road routing with OSRM

Start Docker Desktop and wait for its Linux container engine to be ready:

```powershell
docker info
docker compose version
```

From the project root, run:

```powershell
.\scripts\start.ps1 -PrepareOSRM -DownloadMap
```

This command:

1. Downloads Geofabrik's Southern Zone extract, which includes Kerala, if
   `osrm/data/map.osm.pbf` is absent. It is a large regional download.
2. Prepares the graph with pinned OSRM image
   `ghcr.io/project-osrm/osrm-backend:v5.27.1` using extract, partition and customize.
3. Starts OSRM on `http://127.0.0.1:5000`.
4. Builds the Kochi road-attribute index and the hospital catalogue.
5. Checks OSRM Route, Nearest and Table, then starts the application.

Preparation can take substantial time, disk space and memory. Existing downloads
are reused. If you already have a compatible extract, place it at
`osrm/data/map.osm.pbf` and run `-PrepareOSRM` without `-DownloadMap`.
`-DownloadKerala` remains an alias for the same regional download.

### Subsequent runs

After the graph is prepared:

```powershell
docker compose -f osrm/docker-compose.yml up -d
.\scripts\start.ps1
```

Select **Local OSRM road routes** in the app. To stop OSRM separately:

```powershell
docker compose -f osrm/docker-compose.yml down
```

Stopping the API does not stop the OSRM container. OSRM uses a car-based profile
with left-hand driving; it grants no emergency access exemptions.

### Rebuild road attributes or hospital locations

These indexes use the same source map as the routing graph:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.build_road_index osrm/data/map.osm.pbf data/road_network/roads.json --bounds 76.20 9.85 76.40 10.10
.\qiskit-env\Scripts\python.exe -m scripts.build_hospital_index osrm/data/map.osm.pbf data/hospitals/hospitals.json
```

Restart the API after replacing an index; loaded indexes are cached. The normal
launcher automatically selects `data/road_network/roads.json` when present.
It also builds a missing hospital index if the source PBF exists.

To rebuild and launch in one command, use `-BuildRoadIndex` or
`-BuildHospitalIndex` with `scripts/start.ps1`. Road-index rebuilding through the
launcher also checks OSRM, so its container must be running.

**Map scope and attribute coverage differ:** the map allows all of Kerala, but
the default road-attribute index covers Kochi: west 76.20, south 9.85, east 76.40,
north 10.10. Roads outside it remain unknown and carry uncertainty in permissive
mode. `require_known_width` rejects unknown width. OSRM routing coverage depends
on the downloaded extract. Wider indexes need more memory; use `--bounds` or
launcher `-RoadIndexBounds` deliberately rather than assuming statewide coverage.

## 5. Costs, constraints and penalties

Lower allocation cost is better. ETA and suitability score are separate quantities.
For each feasible road leg, default cost in seconds-equivalent is:

```text
C = T + 0.5*N + 0.3*S + 0.2*U
```

- `T`: road travel time plus optional simulated traffic delay, including turn time once.
- `N`: baseline travel-time exposure to nominal narrowness. For known width w and
  vehicle width W, the factor is `clip(1 - (w-W)/1m, 0, 1)`.
- `S`: baseline travel-time exposure weighted by the documented surface preferences.
- `U`: baseline travel-time exposure to missing width (weight 0.7) and missing or
  unrecognized surface (weight 0.3).

Known access/direction violations, closures and exceeded vehicle limits exclude
routes before allocation; faster travel cannot offset them. Unknown data does not
certify suitability. Traffic is simulated, not live, and is counted once by default.
Synthetic mode uses 30 km/h geometric estimates and has no road-attribute penalties.

Each served ambulance/incident/hospital choice has cost:

```text
severity * response_leg_cost/60 + transport_weight * hospital_leg_cost/60
```

For the allocation model:

- Each incident has exactly one selected choice, including an explicit unserved choice.
- Each ambulance and hospital receiving slot can be used at most once.
- Unserved cost is `severity * M`, where `M = 1 + sum(max served cost per incident)`.
  This prioritizes total severity served before the travel/suitability objective.
- The QUBO constraint penalty is `P = 1 + sum(max choice cost per retained incident group)`.
  One-hot violations incur `P*(selected_count-1)^2`; a conflicting pair across
  incidents incurs P when it shares an ambulance or hospital slot.

Both M and P are recomputed for each scenario after road costs are built. The
penalty algebra is checked exhaustively against all bitstrings in representative
small scenarios, including unavailable resources. Invalid bitstrings lose to the
valid all-unserved plan. Valid outputs are independently checked at the API boundary.

QAOA retains at most three served choices plus unserved per incident, with a
12-qubit cap. Classical examines all compatible choices. The shortlist can exclude
the full optimum, and finite QAOA optimization/sampling can miss the reduced
optimum too. Correct penalties do not guarantee that QAOA finds the best sample.
These policies and coefficients are research assumptions, not calibrated medical rules.

See [the cost specification](tasks/road-attribute-cost-proposal.md) and
[implementation plan](QuantumRescue_Implementation_Plan.md) for details.

## 6. Configuration

Environment variables are optional:

- `OSRM_BASE_URL`: routing origin; default `http://127.0.0.1:5000`.
- `ROAD_INDEX_PATH`: road-index JSON path. The launcher sets the default file when
  present; direct uvicorn startup needs this variable to load attributes.
- `HOSPITAL_INDEX_PATH`: catalogue JSON path; default `data/hospitals/hospitals.json`.
- `MAP_TILE_URL`: HTTP(S) tile template containing `{z}`, `{x}`, `{y}`.
- `MAP_TILE_ATTRIBUTION`: plain-text credit required by your tile provider.
- Frontend runner only: `PORT` (default 5173), `BACKEND_TARGET` (default API on 8000),
  `MOCK_SCENARIO` (`success`, `no-route`, `rejected`, `service-failure`).

For direct Windows API startup with attributes:

```powershell
$env:OSRM_BASE_URL = 'http://127.0.0.1:5000'
$env:ROAD_INDEX_PATH = (Resolve-Path data/road_network/roads.json).Path
.\qiskit-env\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Keep local services bound to loopback. Tile URLs are delivered to the browser;
do not put secret credentials in them. OSM tiles need internet and normal visible
attribution. Use an appropriate provider for deployment beyond a small demo.

## 7. Development and verification

Backend checks do not need Docker, a frontend build or live OSRM:

```powershell
.\qiskit-env\Scripts\python.exe -m pytest -q
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts --check
```

Frontend tests and isolated browser integration:

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:integration
```

Browser integration starts a temporary API and checks routes, GPS, allocation,
solver switching, trips, hospital selection, error handling and responsive layouts.
Windows uses Edge; elsewhere run
`npx --no-install playwright-core install chromium` from `frontend` to install
the browser pinned by the project's Playwright dependency.
Screenshots are written to ignored `frontend/test-results/`.

Check the real routing service separately:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.check_osrm
```

After an API change, regenerate contracts with
`.\qiskit-env\Scripts\python.exe -m scripts.export_contracts` and include them in
the change. [contracts/README.md](contracts/README.md) explains schema and fixtures.

For frontend-only route-inspector work:

```powershell
npm.cmd --prefix frontend run dev:mock
```

This opens the route inspector on `http://127.0.0.1:5173/` using visibly synthetic
fixtures. It does not simulate the allocation API. Use `npm.cmd --prefix frontend
run dev` to forward real API requests during frontend development.

## 8. Troubleshooting

- **The UI looks old or solver values appear stuck:** stop the old API, rebuild
  (`npm.cmd --prefix frontend run build`), restart and reload the page. Use Ctrl+F5
  once if an earlier cached build is still visible. Current asset responses require
  revalidation. Compare the active solver label and cost; identical plans are now
  explicitly labelled rather than made to look different.
- **Port 8000 is occupied:** stop your previous server with Ctrl+C, or launch
  `scripts/start.ps1 -Port 8001`. Do not assume an existing server uses the latest code.
- **QAOA unavailable:** install `requirements-quantum.txt` into `qiskit-env`, then
  restart. A completed run with no valid sample has no QAOA map; Classical remains usable.
- **OSRM unavailable:** start Docker Desktop and the prepared Compose service,
  then run `scripts.check_osrm`. `/health` only checks the API process.
- **No routable road / NoSegment:** endpoints must be within the configured 100 m
  snapping radius of a road in the extract. Check the location/entrance; the app
  does not silently move it several kilometres or substitute synthetic travel.
- **Road index invalid:** rebuild it from the same source map and restart. Missing
  attributes remain unknown; a configured invalid file is an error.
- **Hospital locations unavailable:** build the hospital index, check
  `HOSPITAL_INDEX_PATH` and restart. Default configured hospital slots can still
  be used independently of the catalogue picker.
- **All incidents unserved with strict width enabled:** mapped widths may be absent.
  Review coverage; permissive demo mode allows unknown width with warnings and penalties.
- **Blank background map:** check internet/provider access. Local markers and routes
  can still work; tile failure and routing failure are reported separately.
- **A script cannot run in your PowerShell policy:** use the manual build/uvicorn
  commands above, or follow your organization's approved script-execution policy.

## Project layout and API

- `backend/allocation/`: scenario models, travel, QUBO, exact enumeration and QAOA.
- `backend/intelligence/` and `backend/optimization/`: enrichment, costs and validation.
- `backend/osrm/`: validated OSRM HTTP client and route decoding.
- `frontend/src/`: allocation dashboard, solver views, trips and route inspector.
- `scripts/`, `osrm/`: launchers, extraction and routing preparation.
- `tests/`, `frontend/tests/`: backend and browser checks.
- `contracts/`: generated OpenAPI and shared synthetic fixtures.

API documentation: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
Useful endpoints: `/health`, `/api/readiness`, `/api/map-config`,
`/api/allocation/demo`, `/api/allocation/vehicle-profiles`, `/api/allocation/optimize`,
`/api/hospitals`, `/api/emergency/route`, `/api/emergency/simulate-traffic`,
`/api/emergency/block-road`. The route inspector is at `/routes`.

Local tests and browser checks do not establish hosted CI success or production
readiness. Authentication, persistent dispatch state, arbitrary hospital capacity,
multi-round scheduling, authoritative clinical data and live traffic remain outside
this research prototype.

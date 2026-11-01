# QuantumRescue --- Implementation Plan

**Project:** OSRM-powered hybrid quantum-classical emergency routing\
**Prototype target:** Milestone-based; original 5--6 hour estimate is provisional\
**Initial use case:** Ambulance routing in Kochi, Kerala\
**Status:** Research prototype / hackathon demonstration

**Revised priority (1 November 2026):** Complete local OSRM and an
interactive map before extending emergency scoring or quantum optimization.
The first usable demonstration must show real road routes on a map.

### Current implementation status

- Python environment, OSRM preparation scripts, an OSM attribute extractor,
  classical scoring/validation, and a FastAPI routing API are implemented.
- The synthetic offline demonstration has run successfully. This verifies
  the demo pipeline, not routing on the real Kochi road network.
- Local OSRM preprocessing and live routing have not yet been verified;
  Docker and a suitable map extract are prerequisites.
- No map frontend, QUBO model, or QAOA integration has been implemented.

Retain the existing backend work. The next implementation effort is Phase 1
below; do not advance to new optimization work until its acceptance checks pass.

------------------------------------------------------------------------

## 1. Project Objective

Build a prototype that identifies a fast, feasible route for an
ambulance by combining:

-   Road-network data from OpenStreetMap.
-   Route generation through OSRM.
-   Custom emergency-specific road and traffic scoring.
-   Classical route optimization.
-   QUBO formulation and QAOA using Qiskit.
-   A map-based dashboard for route comparison.

The prototype should demonstrate how road width, accessibility,
congestion, road closures, and risk can affect route selection.

> **Safety note:** This is a research demonstration, not a production
> emergency-dispatch system. It must not be used to direct real
> emergency vehicles without validation, authoritative road data,
> operational approvals, and a reliable fallback.

## 2. Core Design Principle

**OSRM provides routing capabilities; QuantumRescue provides
emergency-specific intelligence and optimization.**

Do not attempt to embed QAOA inside OSRM.

Instead, build a Python orchestration layer that: 1. Requests routes
from OSRM. 2. enriches road segments with available road attributes and
traffic estimates. 3. calculates emergency-specific costs. 4. builds a
small optimization problem. 5. runs classical and quantum optimizers. 6.
validates all candidate routes. 7. returns a safe, feasible route with a
classical fallback.

## 3. Recommended Technology Stack

  -----------------------------------------------------------------------
  Component               Technology              Purpose
  ----------------------- ----------------------- -----------------------
  Base road data          OpenStreetMap           Road geometry and
                                                  mapped attributes

  Routing engine          OSRM                    Route, alternatives,
                                                  table and nearest
                                                  services

  Road graph analysis     OSMnx / NetworkX        Road attributes and
                                                  graph operations

  Backend                 Python + FastAPI        API and orchestration

  Classical routing       OSRM / NetworkX A\*     Baseline and fallback

  Optimization model      QUBO                    Binary optimization
                                                  formulation

  Quantum optimizer       QAOA with Qiskit        Approximate
                                                  optimization experiment

  Simulator               Qiskit Aer              Local quantum circuit
                                                  simulation

  Frontend                Angular                 Dashboard

  Map rendering           Leaflet                 Display routes and
                                                  locations

  Traffic for MVP         Simulated traffic       Reproducible congestion
                                                  scenarios
  -----------------------------------------------------------------------

Build the minimal Leaflet map during Phase 1. Angular remains the planned
dashboard framework, but no Angular application exists yet. If its setup
would delay the first map milestone, use a minimal web frontend and extend
that same map later. Do not wait for QAOA to build the map.

## 4. System Architecture

``` mermaid
flowchart TD
    A[Ambulance location and incident location] --> B[FastAPI backend]
    B --> C[OSRM route generation]
    C --> D[Candidate routes and road geometry]
    D --> O[Phase 1: Leaflet map with endpoints and OSRM routes]
    D --> E[Road and traffic enrichment]
    E --> F[Emergency cost calculator]
    F --> G[Classical preprocessing]
    G --> H[Candidate route / graph reduction]
    H --> I[QUBO formulation]
    I --> J[QAOA with Qiskit Aer]
    J --> K[Decode and validate solutions]
    K --> L[Compare with classical baseline]
    L --> M[Select best feasible route]
    M --> N[Angular and Leaflet dashboard]
```

## 5. Implementation Milestones

The sequence below replaces the fixed one-phase-per-hour schedule.
Docker installation, map download and preprocessing time depend on the
host and extract size. Complete each milestone's verification before
moving to the next; an offline fixture alone does not complete Phase 1.

### Phase 1 --- Local OSRM and Interactive Map Setup

**Priority:** Immediate next milestone; required before further optimization.

#### 1.1 Prepare the local routing service

1. Reuse the project directory, Python environment and existing OSRM scripts.
2. Install/start Docker Desktop with Linux containers and verify the engine.
3. Obtain a small Kochi OSM extract, or use the full Kerala extract if needed.
4. Place it at `osrm/data/map.osm.pbf` and run `osrm/prepare.ps1`.
5. Prepare OSRM using extraction, partitioning and customization, then start
   the local service with the existing conservative car-based Lua profile.
6. Run `python -m scripts.check_osrm` to exercise Route, Nearest and Table.

**Verification:** The real local service returns valid Kochi route geometry,
nearest-road information and a duration matrix. Request alternatives, but
accept one route when OSRM cannot provide alternatives.

#### 1.2 Connect real route data to the backend

1. Generate `data/road_network/roads.json` from the same OSM extract with
   `python -m scripts.build_road_index` and configure `ROAD_INDEX_PATH`.
2. Start FastAPI with the local `OSRM_BASE_URL`.
3. Exercise `POST /api/emergency/route` with two locations in map coverage.
4. Verify candidate GeoJSON coordinates, distances, durations and warnings.
5. Keep scoring controls disabled for the initial baseline view. Display
   limited feasibility checks and unknown attributes explicitly; do not
   require QUBO, QAOA or new scoring capabilities to render road geometry.

**Verification:** The API returns candidates sourced from local OSRM,
with no synthetic fixture substituted for a failed live request.

#### 1.3 Build the initial map interface

1. Create a Leaflet map centered on Kochi with visible map attribution.
2. Allow origin and destination selection by map clicks or coordinate inputs.
3. Show distinct origin/destination markers and a route action.
4. Call the backend routing endpoint and draw returned candidate GeoJSON.
5. Highlight the selected route, distinguish rejected candidates, and fit
   the map bounds to the route geometry.
6. Show distance, estimated duration, data uncertainty and route status.
7. Handle loading, invalid inputs, no route and unavailable OSRM states;
   clear obsolete results when a new request fails.
8. Configure a development proxy or explicit local frontend origin for API
   access, depending on how the frontend is served.

The basemap and the routing graph are separate resources. Local OSRM does
not provide background map tiles. Configure a tile provider with appropriate
attribution and usage terms; document that hosted tiles require internet
access. Fully offline tile hosting is a later extension.

**Verification:** In a browser, choose two Kochi locations and see an actual
local-OSRM route, markers, distance and duration. Change an endpoint and
confirm the route updates. Stop OSRM and confirm a clear error replaces
the old result. Test the frontend build and existing backend regression suite.

Suggested project structure:

``` text
quantum-rescue/
├── backend/
├── frontend/
├── data/
│   └── road_network/
├── osrm/
│   ├── data/
│   │   └── map.osm.pbf
│   ├── ambulance.lua
│   ├── prepare.ps1
│   └── docker-compose.yml
└── README.md
```

Useful references: - OSRM API:
https://project-osrm.org/docs/v5.24.0/api/ - OSRM backend:
https://github.com/Project-OSRM/osrm-backend - Geofabrik Kerala extract:
https://download.geofabrik.de/asia/india/kerala.html

**Deliverable:** A working map backed by local OSRM and FastAPI, using
real Kochi road geometry. Only after this is verified should Phase 2 resume.

### Phase 2 --- Emergency Intelligence Engine

**Dependency:** Phase 1 accepted. Reuse the implemented engine and verify
its behavior on the real routes now visible on the map.

Create:

``` text
backend/intelligence/
├── road_analyzer.py
├── traffic_analyzer.py
└── cost_calculator.py
```

#### 2.1 Road attributes

Read available OpenStreetMap tags:

  Attribute       OSM tag       Use
  --------------- ------------- -----------------------------------
  Road width      `width`       Vehicle suitability
  Road category   `highway`     Road classification
  Lane count      `lanes`       Road capacity context
  One-way         `oneway`      Direction constraints
  Speed limit     `maxspeed`    Speed estimate input
  Access          `access`      Access restrictions
  Surface         `surface`     Road-condition context
  Bridge          `bridge`      Infrastructure context
  Max weight      `maxweight`   Vehicle restrictions where mapped
  Max height      `maxheight`   Vehicle restrictions where mapped

Important: - OSM attributes are incomplete and vary by location. -
Missing width must be marked **unknown**, not assumed safe. - Do not
infer usable carriageway width from a road's nominal width alone. -
Vehicle suitability must account for ambulance dimensions, turning
requirements, obstructions and applicable restrictions. - For the demo,
use explicitly labelled assumptions when data is unavailable.

#### 2.2 Traffic simulation

For the MVP, generate deterministic simulated traffic levels: - Low
congestion. - Medium congestion. - High congestion. - Blocked road.

Store the simulated value per road segment so results can be reproduced.
Do not describe simulated traffic as live traffic.

#### 2.3 Emergency road cost

For each road segment (e), estimate:

\[ T_e(t) = `\frac{d_e}{v_e(t)}`{=tex} \]

where: - (d_e) is segment distance. - (v_e(t)) is estimated speed when
the ambulance is expected to enter the segment.

A weighted cost can be:

\[ C_e = w_tT_e + w_gG_e + w_sS_e + w_rR_e \]

where: - (T_e): predicted travel time. - (G_e): congestion penalty. -
(S_e): suitability penalty. - (R_e): risk penalty. - (w_t,w_g,w_s,w_r):
configurable weights.

These weights are experimental starting values and must be tuned and
evaluated. Hard physical or legal restrictions must exclude an edge
rather than merely add a penalty.

**Deliverable:** Candidate routes receive transparent cost breakdowns.

### Phase 3 --- Classical Baseline

**Dependency:** Phase 2 verified on real route data. Reuse the implemented
classical optimizer and extend the initial map with cost comparisons.

Create:

``` text
backend/optimization/
├── classical_optimizer.py
└── route_validator.py
```

Tasks: 1. Request candidate routes from OSRM. 2. Match route geometry to
road-segment attributes where possible. 3. Calculate the custom cost for
each candidate. 4. Reject routes that violate known hard constraints. 5.
Rank remaining routes by total predicted cost. 6. Return the best
feasible route. 7. Keep a standard OSRM route as a fallback only if it
passes the same validation; otherwise return no feasible route when none remain.

For a stronger baseline, build a small directed road graph with NetworkX
and run A\* using the custom edge costs.

**Deliverable:** A working classical emergency-routing baseline.

**Limitation:** OSRM alternatives are not guaranteed to include the
globally optimal route under our custom costs. Ranking OSRM alternatives
is a candidate-selection demonstration, not a global custom-cost
shortest-path proof.

### Phase 4 --- QUBO Formulation

**Dependency:** The map and classical routing baseline work end to end.

Create:

``` text
backend/optimization/qubo_builder.py
```

For a small directed graph, define a binary variable for each eligible
directed edge:

\[ x_e =
```{=tex}
\begin{cases}
1 & \text{if edge }e\text{ is selected}\\
0 & \text{otherwise}
\end{cases}
```
\]

Minimize total edge cost:

\[ `\min `{=tex}`\sum`{=tex}\_e C_ex_e \]

Enforce flow conservation at each node:

\[ `\sum`{=tex}*{e`\in `{=tex}Out(v)}x_e -
`\sum`{=tex}*{e`\in `{=tex}In(v)}x_e = b_v \]

where: - (b_v=1) at the source. - (b_v=-1) at the destination. - (b_v=0)
at intermediate nodes.

A basic QUBO is:

\[ Q(x)=`\sum`{=tex}*e C_ex_e+ `\lambda`{=tex}`\sum`{=tex}*v
`\left`{=tex}( `\sum`{=tex}*{e`\in `{=tex}Out(v)}x_e-
`\sum`{=tex}*{e`\in `{=tex}In(v)}x_e-b_v `\right`{=tex})\^2 \]

Here, (`\lambda`{=tex}) penalizes flow-constraint violations.

Implementation considerations: - Use a small directed graph for the
first experiment. - Remove known inaccessible edges before building the
QUBO. - Check for disconnected selections and cycles. - Flow
conservation alone can permit disconnected cycles; add suitable
constraints or detect and reject such solutions. - Choose penalty
weights carefully so feasibility is not sacrificed for a lower travel
cost. - Compare the QUBO model's optimum with an exact classical
solution on the same small graph.

**Deliverable:** A tested QUBO model for a small emergency-routing
graph.

### Phase 5 --- QAOA Integration

**Dependency:** Phase 4 QUBO verified against an exact classical solution.

Create:

``` text
backend/optimization/qaoa_optimizer.py
```

Install compatible packages in a clean virtual environment:

``` bash
pip install qiskit qiskit-aer qiskit-optimization qiskit-algorithms
```

Because Qiskit packages evolve, verify compatible versions and imports
before implementation.

Implementation sequence: 1. Convert the QUBO into a Qiskit Optimization
quadratic program. 2. Convert it to a QUBO-compatible unconstrained
model. 3. Configure a QAOA-compatible sampler using Qiskit Aer. 4.
Select a classical parameter optimizer such as COBYLA. 5. Run QAOA with
a small circuit depth, initially (p=1). 6. Decode measured binary
samples. 7. Evaluate each sample against the original objective and
constraints. 8. Return the best feasible sample found.

Pseudocode:

``` python
# Conceptual outline; configure a sampler compatible
# with the installed Qiskit version.

qubo = build_qubo(road_graph, edge_costs)

qaoa = QAOA(
    sampler=compatible_aer_sampler,
    optimizer=COBYLA(maxiter=50),
    reps=1
)

solver = MinimumEigenOptimizer(qaoa)
result = solver.solve(qubo)
```

Also compare: - Standard QAOA. - Warm-start QAOA, if time permits. -
Exact classical optimization.

Do not claim quantum advantage based on a single run or a small
simulator experiment.

**Deliverable:** QAOA produces candidate solutions that can be decoded
and validated.

### Phase 6 --- Extend the Existing Map with Optimizer Comparisons

**Dependency:** Validated classical and QAOA results are available.
Extend the map built in Phase 1; this phase does not introduce the first map.

Display: - Ambulance starting location. - Emergency destination. -
Candidate routes. - Selected classical route. - Best feasible QAOA
candidate. - Distance and estimated travel time. - Congestion and
road-suitability breakdown. - QAOA objective value and execution time. -
Feasibility status. - Road-blockage simulation and rerouting.

Use Leaflet to render GeoJSON route geometry.

**Deliverable:** An end-to-end demonstration with transparent
classical-versus-quantum comparisons.

## 6. Backend API Design

For Phase 1, consume the existing `POST /api/emergency/route` response,
including `candidates[].geometry`, rather than waiting for quantum APIs.
Use `optimization.algorithm: "classical"` and disable optional scoring
controls for the initial OSRM baseline view. The map remains useful even
when some candidates fail the limited feasibility checks.

The endpoint list and quantum examples below describe the eventual API.
The optimize, stored-results retrieval and comparison endpoints are later
work; do not make the initial map depend on them. Simulation endpoints
already exist, but map controls for them follow the baseline map milestone.

  -----------------------------------------------------------------------------------
  Method                  Endpoint                            Purpose
  ----------------------- ----------------------------------- -----------------------
  POST                    `/api/emergency/route`              Generate candidate
                                                              routes

  GET                     `/api/emergency/routes/{id}`        Retrieve route results

  POST                    `/api/emergency/optimize`           Run classical and
                                                              quantum optimization

  POST                    `/api/emergency/simulate-traffic`   Change simulated
                                                              congestion

  POST                    `/api/emergency/block-road`         Simulate a road closure

  GET                     `/api/emergency/compare/{id}`       Compare optimizer
                                                              results
  -----------------------------------------------------------------------------------

Example request:

``` json
{
  "ambulance": {
    "latitude": 9.9312,
    "longitude": 76.2673,
    "width_m": 2.4
  },
  "emergency": {
    "latitude": 9.9500,
    "longitude": 76.2900
  },
  "optimization": {
    "algorithm": "QAOA",
    "consider_traffic": true,
    "consider_road_width": true,
    "consider_risk": true
  }
}
```

Example response shape:

``` json
{
  "status": "success",
  "classical_route": {
    "distance_m": 0,
    "estimated_time_s": 0,
    "feasible": true
  },
  "quantum_candidate": {
    "distance_m": 0,
    "estimated_time_s": 0,
    "feasible": true,
    "qubo_objective": 0
  },
  "comparison": {
    "classical_runtime_ms": 0,
    "quantum_runtime_ms": 0,
    "quantum_solution_feasible": true
  }
}
```

The zeros are placeholders; actual values must come from execution.

## 7. Suggested Project Structure

``` text
quantum-rescue/
│
├── backend/
│   ├── main.py
│   ├── osrm/
│   │   ├── client.py
│   │   └── route_generator.py
│   ├── intelligence/
│   │   ├── road_analyzer.py
│   │   ├── traffic_analyzer.py
│   │   └── cost_calculator.py
│   ├── optimization/
│   │   ├── classical_optimizer.py
│   │   ├── qubo_builder.py
│   │   ├── qaoa_optimizer.py
│   │   └── route_validator.py
│   └── models/
│       └── route.py
│
├── frontend/
│   └── Angular application
│
├── data/
│   └── road_network/
│
├── osrm/
│   ├── ambulance.lua
│   └── docker-compose.yml
│
└── README.md
```

## 8. Success Criteria

### First milestone: local OSRM and map

-   [ ] Local OSRM instance responds successfully.
-   [ ] Route, Nearest and Table services pass a live Kochi smoke check.
-   [ ] Alternative routes can be requested; a single valid result is handled.
-   [ ] Backend returns real OSRM candidate GeoJSON without fixture substitution.
-   [ ] Map loads with attribution and origin/destination selection.
-   [ ] Actual routes, distance and duration are displayed on the map.
-   [ ] Changing an endpoint recalculates and redraws the routes.
-   [ ] No-route and service-failure states clear stale route results.
-   [ ] Frontend build and backend regression checks pass.

### Subsequent milestones: intelligence and optimization

-   [ ] Road attributes are extracted where available.
-   [ ] Missing road attributes are explicitly represented.
-   [ ] Simulated traffic changes route costs.
-   [ ] Known inaccessible roads are excluded.
-   [ ] Classical baseline returns a feasible route.
-   [ ] QUBO formulation is tested on a small graph.
-   [ ] QAOA runs using a simulator.
-   [ ] Quantum samples are decoded and validated.
-   [ ] Classical exact optimum is available for small test cases.
-   [ ] Classical and quantum comparisons extend the existing map.
-   [ ] Road-blockage simulation triggers recalculation.

## 9. Important Technical Limitations

### OSRM and custom costs

OSRM's standard routing API does not accept arbitrary per-request costs
for every road segment. Its routing weights are determined by the
prepared routing graph and profile. For the first prototype: - Use OSRM
to generate candidate routes. - Enrich and score them in Python. - Use a
custom graph for genuinely custom-weighted A\* or QUBO experiments.

A custom OSRM Lua profile can change access and speed behavior, but
profile changes generally require rebuilding or customizing the routing
data.

### Traffic data

OpenStreetMap is primarily road-network and map data, not a live traffic
feed. Use simulated traffic for the initial demo. Clearly label it as
simulated. Add a licensed traffic provider later if live traffic is
required.

### Quantum limitations

QAOA on a simulator is an experiment, not proof of faster routing.
Compare it against exact classical optimization and classical routing
using identical graph data, costs, constraints and stopping criteria.

### Emergency safety

Never use an infeasible quantum output. Validate connectivity, road
restrictions, vehicle dimensions and data confidence. Always retain a
classical fallback. Real deployment requires field validation and
approval from relevant emergency-service and road authorities.

## 10. Recommended Build Order

Follow this order, with the first three items forming the immediate milestone:

1.  Start local OSRM and verify Route, Nearest and Table with real Kochi data.
2.  Connect FastAPI to local OSRM and the matching road-attribute extract.
3.  Build and verify the interactive Leaflet map with actual route geometry.
4.  Verify emergency-specific scoring and classical validation on those routes.
5.  Add map controls for simulated traffic, closures and classical comparisons.
6.  Build a small QUBO and verify it with exact classical optimization.
7.  Run QAOA, decode candidates and validate feasibility.
8.  Extend the same map with classical-versus-quantum comparisons.
9.  Consider warm-start QAOA and live traffic as extensions.

**The first milestone:** choose two Kochi locations on a map and display
a real route returned by local OSRM through FastAPI. Request alternatives
without requiring OSRM to return a particular count. Complete and verify
this experience before moving to further intelligence or quantum work.

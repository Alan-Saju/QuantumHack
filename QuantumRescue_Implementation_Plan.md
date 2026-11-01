# QuantumRescue: emergency resource allocation implementation plan

Updated 1 November 2026. This plan supersedes the previous shortest-route-first
priority. Existing routing and collaboration infrastructure remain supported.

## Objective and acceptance

An operator places three ambulances and three incidents manually around Kochi,
selects a network of three or five fixed synthetic hospital sites, then allocates
ambulance + incident + hospital receiving slot in a
single dispatch round. Success means compatible resources, no double booking,
explicit unserved incidents and independently validated solver outputs. Routes
supply travel costs; nearest distance alone does not decide allocation.
Research demonstration only; locations, capabilities, capacities and severity
weights are synthetic and are not authoritative medical dispatch guidance.

## Modules and order

1. Scenario models and synthetic seed -> cost/candidate generation.
2. Candidate generation -> full exact allocation baseline and QUBO formulation.
3. QUBO -> Ising Hamiltonian -> local Qiskit QAOA -> sample validation.
4. Allocation service -> typed API -> map, controls and solver comparison.
5. Verification -> generated API contract -> configuration and handoff docs.

## Decision model

Each hospital exposes one named receiving slot in the first implementation:
available (1) or occupied (0). This models resource contention without claiming
arbitrary bed-capacity support. Ambulances have capabilities and availability;
incidents specify severity (1..3) and required capability. Hospitals must support
the incident capability. Each ambulance and slot can be used at most once.

A binary variable x_k selects a compatible (ambulance, incident, hospital) choice.
Each incident also has an explicit unserved choice. Cost for a served choice is
severity * response_minutes + transport_weight * transport_minutes. Unserved
cost is severity * M, with M greater than the sum of all maximum served costs.
This prioritizes total severity served, then travel cost; it is not a clinical
triage policy. Infeasibility is visible as unserved incidents.

For each incident group G, add P * (sum(x in G) - 1)^2. For each pair sharing an
ambulance or hospital slot across incidents, add P*x_i*x_j. P exceeds the sum
of the maximum costs across incident groups, so an invalid bitstring cannot beat
a valid schedule. Store upper triangular Q with energy offset + sum Qij*x_i*x_j
(no symmetric double counting). Expose labels, coefficients and offset via API.

Full enumeration over incident choice groups supplies the exact baseline.
QAOA retains the cheapest three compatible served choices per incident plus
unserved: at most 12 qubits. No baseline solution is injected into QAOA. Report
full and retained counts, reduced exact optimum and full exact optimum separately.
Shortlisting may exclude the full optimum. Never claim quantum advantage.

Convert x=(1-Z)/2 into I/Z/ZZ terms, construct a Hadamard-initialized circuit
with alternating cost RZ/RZZ and X-mixer RX layers, optimize expected energy
with seeded SciPy COBYLA, then sample the final Qiskit statevector. Report depth,
shots, seed, evaluations, energy trace, feasible sample probability, runtime and
objective gap. Decode little-endian bits explicitly. Select only independently
validated samples. Return the full exact plan if QAOA is unavailable, has no
valid sample, or produces a worse objective; expose the raw QAOA result.

## Travel sources

Synthetic mode is the default and uses labelled geometric travel estimates and
straight connectors, not road geometry. Live OSRM mode generates actual route
legs for ambulance -> incident and incident -> hospital and uses their travel
times. Unreachable legs remove choices. Upstream failure returns an error and
never silently substitutes synthetic travel. Existing road scoring remains in
the route inspector; allocation does not claim road suitability validation.

## Configuration and execution

Python 3.14 virtual environment: `qiskit-env/Scripts/python.exe`.
Install baseline: `./qiskit-env/Scripts/python.exe -m pip install -r requirements.txt`.
Install quantum extras: `./qiskit-env/Scripts/python.exe -m pip install -r requirements-quantum.txt`.
Build: `npm --prefix frontend run build`.
Run: `./qiskit-env/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`.
Open `/` and choose Resource allocation; route inspector remains accessible.
OSRM_BASE_URL defaults to http://127.0.0.1:5000; MAP_TILE_URL and attribution
retain current behavior. No quantum credentials or cloud hardware required.
QAOA request bounds: p=1..3, shots=64..8192, evaluations=10..100, fixed seed.
Keep service local; a production concurrent job queue is a later milestone.

Manual demo workflow: choose A1-A3 or I1-I3 above the map and click to place it;
the placement target advances to the next resource. Markers for ambulances and
incidents are draggable. Coordinate inputs provide an equivalent keyboard path.
Map and submitted coordinates use the same six-decimal precision. Hospital sites
cannot be moved in the UI. `GET /api/allocation/demo?hospital_count=3|5` loads a
fixed hospital preset; changing the network preserves manually placed resources.
Incident care requirements and severity, ambulance availability, and hospital
slot availability remain editable allocation criteria. Weather and traffic are
future additions after this manual setup and allocation workflow is established.

The local launcher `scripts/start.ps1` enables backend auto-reload by default
(`-NoReload` opts out). If frontend assets are newer than the running backend,
the allocation UI reports missing endpoints and explicitly requests a restart.

## Implementation slices and verification

- Slice 1: typed bounded scenario, demo seed, exact solver and QUBO. Test
  constrained allocation, zero availability, penalties and energy equivalence.
- Slice 2: Qiskit circuit, optimizer and sampling. Test Ising energies against
  every small-model bitstring, probability normalization and genuine execution.
- Slice 3: API and map with all nine markers, capability/availability controls,
  solver selection, dispatch lines, unserved reasons and solver metrics. Verify
  real API browser flow on desktop/mobile, errors and stale-result handling.
- Slice 4: full pytest, frontend unit/build/browser suites, OpenAPI drift check,
  setup docs and final review. Preserve pre-existing uncommitted changes.

## Later milestones

Arbitrary hospital capacity via slot expansion or bounded binary slack variables;
route alternatives as additional decision variables; response-time hard limits;
traffic and closures; multi-round vehicle release and hospital occupancy;
authenticated operator sessions and job queue; calibrated operational datasets;
noise-aware Aer/hardware experiments and repeated-seed benchmark suite. These
are separate from the initial verified allocation demonstration.

## Quality boundaries

Use existing strict Pydantic models, additive endpoints and text-safe rendering.
Do not overwrite existing work, silently change data sources, suppress tests,
label a classical fallback as QAOA, or present simulated results as hardware.
Tests live in tests/test_allocation.py and frontend/tests/allocation-browser.mjs.

## Implementation checkpoint

Implemented: bounded scenario models, all nine map markers, joint candidate
generation, full exact enumeration, retained QUBO, Ising conversion, real local
Qiskit circuit simulation, COBYLA loop, seeded sampling, independent validation,
explicit classical fallback, typed APIs and map controls. Existing routing/GPS
flows remain available. Optional quantum dependencies are pinned separately and
installed in backend/browser CI jobs.

Verified locally: 55 backend tests, 13 frontend unit tests, frontend build,
generated contract, existing route/mock/GPS browser suites and allocation
desktop/mobile browser flow. The seeded 10-evaluation synthetic demonstration
used 10 qubits (16 full choices), served all three incidents and sampled the full
exact optimum, objective 20.3809893942, with feasible probability approximately
7.58%. This is one small seeded simulation, not evidence of quantum advantage.
Real OSRM allocation and hosted CI execution remain unverified.
The actual server on port 8000 was refreshed after diagnosing an older running
backend that returned 404 for both allocation endpoints. Both endpoints and a
five-hospital QAOA request have now been checked on that running server. Browser
verification covers manual map placement, dragging, coordinate submission,
fixed hospital sites and network switching without losing edited locations.

Quantum implementation references:
- [IBM Quantum QAOA tutorial](https://quantum.cloud.ibm.com/docs/en/tutorials/quantum-approximate-optimization-algorithm)
- [Qiskit Statevector source/API](https://github.com/Qiskit/qiskit/blob/main/qiskit/quantum_info/states/statevector.py)
- [Qiskit QAOA ansatz reference](https://github.com/Qiskit/qiskit/blob/main/qiskit/circuit/library/n_local/qaoa_ansatz.py)

The implementation constructs the RZ/RZZ cost layers and RX mixer explicitly,
so the QUBO-to-Ising coefficients and bit order can be independently tested.

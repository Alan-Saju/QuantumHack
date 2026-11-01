# Two-developer workflow checklist

See [the implementation plan](plan.md) for scope, ownership and verification.
Shared baseline and contract work are implemented on `codex/shared-baseline`.
Unchecked items still require implementation or verification.

- [x] Task 1: Review current work and establish a tested baseline branch.
- [x] Verify repository permissions: owner Alan-Saju and collaborator Abhinand442 (write).
- [ ] Both developers confirm their own checkouts and local setup.
- [x] Document branches, pull requests and ownership in CONTRIBUTING.md.

## Checkpoint: shared starting point

- [x] Baseline branch published as codex/shared-baseline, with draft PR #1.
- [x] Verify two isolated checkouts can branch from the same revision; build and test committed source from a fresh clone.
- [ ] Both developers review draft PR #1 before merging to main.
- [x] Existing unfinished work has been preserved, reviewed and tested.

- [x] Task 2: Export and check the API contract.
- [x] Add shared, validated synthetic response fixtures and use them in browser tests.
- [x] Task 3: Add explicit frontend mock mode and configurable live forwarding.
- [x] Verify mock mode needs neither Python nor Docker and is visibly labeled.
- [x] Task 4: Make backend tests independent of the frontend build.
- [x] Retain built-asset coverage in browser integration checks.

## Checkpoint: independent development

- [x] Frontend development works with the backend stopped.
- [x] Backend tests work without frontend dependencies or generated assets.
- [x] Live mode reports failures without substituting fixtures.

- [x] Task 5: Add backend, frontend, contract and browser pull-request checks.
- [ ] Verify checks locally and inspect an authorized GitHub Actions run.
- [x] Task 6: Complete developer setup and integration documentation.

## Checkpoint: integrated collaboration

Local verification on 1 November 2026: 35 Python tests, 13 frontend tests,
frontend build, contract drift check, built-app browser checks and all four
mock browser scenarios pass. Python tests and contracts also passed from a
temporary copy containing no frontend folder. The checks below require
publication, human review or live Docker/data verification.

- [ ] Review and combine changes from two independent branches.
- [ ] All automated checks pass after integration.
- [ ] Verify actual local OSRM and the combined map when Docker/data are ready.

## Resource allocation pivot — 1 November 2026

- [x] Replace shortest-route priority with joint dispatch specification and configuration.
- [x] Add typed three-hospital, three-ambulance, three-incident demo and availability controls.
- [x] Implement full exact baseline and upper-triangular QUBO with resource conflicts.
- [x] Convert QUBO to Ising and run genuine local Qiskit QAOA with seeded sampling.
- [x] Expose reduced/full objectives, samples, feasible probability, trace and fallback reason.
- [x] Add default allocation workspace; retain route inspector at `/routes`.
- [x] Verify synthetic and mocked live OSRM travel, shortages, severity priority and API budgets.
- [x] Complete allocation browser verification and final review.
- [x] Enable click, drag and coordinate placement for all three ambulances and incidents.
- [x] Support three or five fixed hospital sites and preserve manual locations on network changes.
- [x] Diagnose the stale backend on port 8000, refresh it and verify actual allocation endpoints.
- [x] Add a missing-endpoint message and backend auto-reload in the local launcher.
- [x] Verify real OSRM allocation against the prepared Kochi road extract.
- [x] Build/configure the Kochi road-attribute index and verify 68/68 real-route segment matches; document a proposed attribute-aware allocation cost.
- [x] Implement shared road costs, vehicle-aware validation on both allocation legs, exact/QAOA coefficient parity, coverage breakdowns and UI controls; verify real OSRM allocation and strict width behavior.
- [ ] Extend to arbitrary hospital capacities, route alternatives and multi-round scheduling.

## Dashboard and map UI

- [x] Add Scenario collapse/restore with state preservation; audit M/P and road penalties; verify solver maps and costs together, explain identical plans, revalidate build assets and rewrite installation/setup documentation.

- [x] Run both solvers once per optimization and switch Classical/QAOA on the map, synchronizing routes, metrics, assignments, fleet/trip snapshots and solver details without recalculating; explain unavailable QAOA output.

- [x] Expand map navigation and resource placement from Kochi to the full Kerala operating rectangle; preserve the three hospital sites and explicit road-data uncertainty outside the Kochi index.

- [x] Use the supplied Sunrise/Gautham/Aster hospital locations and constrain maps and allocation placement to the Kochi operating area; preserve exact hospital coordinates and flag Gautham's unroutable point in verification notes.

- [x] Replace the long desktop form with an independently scrolling scenario rail.
- [x] Keep allocation actions visible on desktop and mobile.
- [x] Add live resource totals, grouped controls and advanced solver disclosure.
- [x] Add resource icons, quick placement selection and explicit map exploration.
- [x] Add map inspection for individual allocation decisions.
- [x] Verify keyboard controls, offline tiles and 320/768/1024/1440px layouts.

## Per-ambulance trip inspection — 1 November 2026

- [x] Add Traveller/Omini demo presets with validated dimensions and explicit-override compatibility.
- [x] Connect selectors and dimension summaries to allocation inputs and invalidate old results on edits.
- [x] Show timestamped fleet snapshots and per-ambulance response/hospital legs with separate and total travel estimates.
- [x] Support marker, dashboard and assignment entry, keyboard access, unassigned/unavailable states, and Back without reoptimization.
- [x] Verify vehicle limits and width preferences on both legs, API contracts, unit tests, real-QAOA browser flows and desktop/mobile screenshots.

## Three-stop route planner — 1 November 2026

- [x] Add incident location between ambulance and hospital with coordinate, click and drag placement.
- [x] Combine both legs' road alternatives and display leg times, total driving time and hospital arrival; reject incomplete journeys.
- [x] Highlight the selected complete trip in light blue and other trips in grey.
- [x] Complete build, all 24 frontend unit tests, browser/GPS/mock/allocation checks and desktop/mobile screenshot review.

## Hospitals from the current map view — 1 November 2026

- [x] Extract hospital nodes, buildings and relations from the local OSM map into a catalogue and add a validated viewport search API.
- [x] Add a shared marker/list hospital picker to `/routes` and allocation hospital slots; discard stale results when the map moves.
- [x] Update route destination C from the selected hospital and recalculate existing trips.
- [x] Allow replacing configured hospital slots without inheriting another facility's care/availability assumptions; expose configurable care capabilities.
- [x] Verify 93 backend tests, 24 frontend tests, full browser integration including hospital search, real catalogue lookup, and desktop/mobile screenshots.

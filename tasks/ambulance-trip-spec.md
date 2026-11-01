# Per-ambulance allocation trip

## Objective
After optimizing the Kochi allocation, a dispatcher can select an ambulance, inspect its assigned Ambulance → Incident → Hospital journey and estimated times, then return to the same dashboard to inspect another ambulance. Traveller and Omini vehicle profiles influence road selection through their dimensions.

## Confirmed choices
- Show the latest allocation snapshot; no GPS feed, moving vehicle animation, or inferred journey progress.
- Use editable demo vehicle profiles rather than claiming manufacturer specifications.
- Preserve the current Kerala operating bounds and existing work in the repository (the workspace expanded from Kochi after this spec was drafted).

## User-facing behavior and acceptance criteria
1. Each ambulance has a labelled Traveller/Omini selector in scenario controls. The vehicle type and editable width (metres), height (metres), and weight (tonnes) are visible. Demo presets: Traveller 2.4 m / 2.8 m / 3.5 t; Omini 1.6 m / 2.0 m / 1.5 t. These are research assumptions, not factory or certified ambulance measurements. Existing clinical capabilities remain independently configured.
2. Changing type loads that profile's dimensions, invalidates the previous allocation and requests reoptimization. Editing dimensions retains the selected type while making the customized values explicit. All dimensions must be positive finite numbers.
3. After optimization, ambulance markers and accessible dashboard ambulance buttons open that ambulance's trip view. A clear entry action is available from its assignment row as well. Inspection does not move resources or trigger a fresh solve.
4. The trip view identifies the ambulance and vehicle profile, incident, and named destination hospital. Only the selected ambulance's two assigned route geometries are shown. The response and hospital legs have distinct styles and text labels.
5. Show separate estimated response and hospital transport minutes plus their sum. Explain that the sum excludes on-scene care, loading, and handover; road suitability scores are not elapsed travel times.
6. Show status as Assigned, Available / unassigned, or Unavailable according to the snapshot and configured availability. Include the snapshot timestamp in IST. Do not label these values as live tracking, en route, picked up, or arrived.
7. For an unassigned ambulance, show the applicable status and a useful empty state; do not invent an incident, hospital, route, or arrival time.
8. Back to dashboard restores the fleet overview, routes, configuration, optimization results, and map interaction mode. Another ambulance can then be selected without reoptimizing. Opening and closing inspection supports keyboard navigation and moves focus meaningfully.
9. Editing scenario inputs or resetting invalidates and closes the trip view, removing stale route/status data. New results replace the snapshot consistently. Resizing an active trip keeps its journey in view.
10. Both trip legs use that ambulance's actual dimensions in OSRM road mode. Known width/height/weight/access violations exclude routes, and width preference can select a different feasible alternative. The UI states that synthetic travel does not apply road restrictions and that OSRM estimates do not include live traffic. No fabricated route is substituted when roads are infeasible.

## Existing architecture and boundaries
- `backend/allocation/scenario.py`: validated ambulance resources and demo defaults; add explicit vehicle type and consistent preset handling without breaking existing dimension-bearing requests.
- `backend/allocation/travel.py`: existing per-vehicle scoring of both legs; preserve geometry caching without sharing vehicle-specific validation results.
- `backend/allocation/qubo.py` and `service.py`: retain exact/QAOA allocation objective and returned leg times/geometries.
- `frontend/src/allocation.js`, `allocation-presentation.js`, `allocation.html`, `allocation.css`: existing scenario/dashboard/map; trip inspection belongs here and may use a focused helper module.
- Existing `/routes` single-ambulance planner remains separate from the allocation trip inspector.
- No new package, GPS integration, database, scheduling engine, production deployment, or unrelated refactor.
- Stable resource IDs and existing request fields remain compatible; vehicle type is additive. Contract snapshots must match any intentional API schema additions.

## Code conventions
Use existing vanilla JavaScript/Leaflet UI and Pydantic models. Render resource names with textContent, not interpolated HTML. Keep trip state separate from scenario inputs and never recalculate an assignment just to inspect it. Example: `const totalMinutes = assignment.response_minutes + assignment.transport_minutes;`.

## Verification
- Python tests in `tests/`: type defaults/validation, explicit dimension overrides, different feasible routes for Traveller/Omini, and vehicle limits on the hospital leg as well as response leg. Preserve existing exact/QAOA costs and cache-isolation checks.
- Frontend tests in `frontend/tests/`: profile changes invalidate prior results; marker and keyboard inspection; leg and total time display; unassigned/unavailable states; back navigation preserves the allocation; scenario edits discard stale inspection; mobile/desktop layout and console checks.
- Build: `cd frontend; npm run build`.
- Frontend unit tests: `cd frontend; npm test`.
- Browser checks against the local app: `cd frontend; node tests/allocation-browser.mjs`.
- Backend checks: `.\qiskit-env\Scripts\python.exe -m pytest tests/test_allocation.py tests/test_allocation_roads.py tests/test_road_cost.py`.
- Render and visually inspect desktop and mobile trip screens. Deterministic route fixtures verify UI behavior; they do not establish real-world road clearance.

## Open questions
None blocking the snapshot/demo-profile version. Actual fleet measurements and a future GPS/status integration can replace the demo assumptions later.

## Review status
Approved by the user: “Implement it”. Implementation and verification authorized.

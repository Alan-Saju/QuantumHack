# Approved ambulance trip implementation

Extends the allocation product plan without replacing its unfinished infrastructure tasks.

Build order: vehicle profiles → trip inspection → lifecycle and browser verification.

- [x] Add validated Traveller/Omini presets, preserving explicit dimension overrides; expose profiles for UI use. Verify API validation and distinct routes on both legs with pytest.
- [x] Add vehicle selectors and dimension summaries; invalidate allocations on edits. Verify payloads and preset/custom transitions in browser tests.
- [x] Add timestamped fleet snapshot and per-ambulance trip inspector using existing allocation geometries. Verify times, selection, unassigned states, back navigation, and stale state removal.
- [x] Build, run frontend/backend/contract checks, and inspect desktop/mobile screenshots. Preserve real QAOA verification and all existing tests.

No new dependencies, services, or live tracking. Geometry caching remains separate from vehicle scoring. All resource names render as text. Vehicle type is additive; existing clients that send explicit dimensions retain those values.

Verified 1 November 2026: full backend suite (89 tests before the final width-preference case), all 21 frontend unit tests, 12 focused vehicle-profile tests, frontend build, and allocation browser suite including actual Qiskit simulation. Screenshots inspected at desktop and mobile widths. A deliberate addition-to-subtraction mutation in trip totals failed the unit test; restored code passed. Existing API test-client dependency emits one deprecation warning.

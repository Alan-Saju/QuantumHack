# Implementation Plan: Two-developer workflow

Status: Shared baseline and API contracts implemented on `codex/shared-baseline`.
Independent runners, test separation, CI configuration and handoff documentation
are implemented. Hosted CI execution, developer confirmations, reviewed integration
and real OSRM verification remain pending.
Review: [draft pull request #1](https://github.com/Alan-Saju/QuantumHack/pull/1).
Date: 1 November 2026

## Objective

Let two developers make and test changes at the same time without sharing
a working directory, depending on each other's running services, or
silently changing the API. Keep the existing OSRM-and-map milestone first.

The GitHub remote already exists at `https://github.com/Alan-Saju/QuantumHack.git`.
The existing map/backend work has been preserved in a reviewed baseline
commit. CONTRIBUTING.md documents setup and ownership; generated contracts
and shared fixtures are implemented. `Abhinand442` has verified write access.
The baseline branch must be reviewed before merging to `main`; no existing
work should be reset or overwritten.

## Work ownership

- Developer A: `backend/`, `osrm/`, Python tests, Python dependencies,
  and the generated API contract. Continue real OSRM setup and validation.
- Developer B: `frontend/`, frontend dependencies, map interactions,
  responsive layouts, and browser tests.
- Shared integration files: root README, launch scripts, CI configuration,
  and the implementation plan. Assign one owner per change to these files.
  Coordinate an API change before either developer depends on it.

These are ownership boundaries for coordination, not access restrictions.
Both developers can review and contribute across the project.

## Task 1: Establish a shared baseline and Git workflow

Review the existing uncommitted work and establish one tested revision on
the existing repository. Verify both developers have access; the owner
invites the second developer if needed. Each developer uses a separate
clone on their own computer, with a local branch per task such as
`codex/map-controls` or `codex/osrm-validation`.

Use pull requests into `main` and review each other's changes. Pull the
latest `main` before starting a branch and update a branch before merging.
Never use a shared filesystem folder or edit the same checkout concurrently.
For two workspaces on one computer, use separate clones or Git worktrees,
different API ports, and separate generated output directories.

Files: `CONTRIBUTING.md`, implementation-plan link.
Acceptance: Both developers can clone, make independent changes, and open
a pull request without overwriting the other's work.
Verification: Demonstrate two branches from the same baseline and review
the documented merge process. No repository access settings are changed
without the required account details and authorization.
Dependencies: None.

## Task 2: Establish the API contract and shared fixtures

Export the current FastAPI OpenAPI schema into `contracts/openapi.json`.
Generate it from backend models; do not maintain a second schema by hand.
Add a small, explicitly synthetic fixture set for success with alternatives,
no route, rejected routes, and service failure. The mock map runner and
browser tests should share these fixtures instead of inventing different
response shapes. Check representative responses against the backend models.

Files: `scripts/export_openapi.py`, `contracts/openapi.json`,
`contracts/fixtures/`, contract tests.
Acceptance: The frontend has a documented request/response shape, fixtures
match the backend, and an uncommitted schema change is detected by a check.
Verification: Export twice with identical output; validate fixture payloads
and compare the exported schema with the checked-in snapshot.
Dependencies: Task 1 baseline.

## Task 3: Allow frontend development without Python or Docker

Add a frontend-only local runner using the existing Node runtime. Provide
an explicit mock mode serving the shared fixtures, plus a live mode that
forwards `/api/` requests to a configurable local backend. Keep browser
requests relative to `/api/` so the existing same-origin deployment works.

Use documented commands such as `npm run dev:mock` and `npm run dev`, with
a configurable frontend port and backend target. Mock mode must display a
persistent "Synthetic demo data" label. Live mode must report service
failures and must never fall back to mock routes. Restrict the runner to
loopback by default; keep static file access inside the frontend directory.

Files: `frontend/dev-server.mjs`, `frontend/package.json`,
`frontend/src/app.js`, runner tests.
Acceptance: Developer B can change and test the map without Python,
Docker, or Developer A's server; live mode still integrates with FastAPI.
Verification: Test mock success/error scenarios, live forwarding, an
unavailable backend, port configuration, and path-traversal rejection.
Dependencies: Task 2 fixtures and contract.

## Task 4: Allow backend testing without a frontend build

Separate app creation from server startup sufficiently to inject a small
temporary static directory into asset-serving tests. Backend tests must
run without `frontend/node_modules` or `frontend/dist`. Keep the existing
asset-serving tests active using test assets, and retain real built-asset
verification in browser integration checks. Preserve the current root-page
setup instructions when the real frontend has not been built.

Keep the existing FastAPI/OSRM workflow and local configuration; generated
road data, virtual environments and secrets remain outside version control.
Do not require Docker for Python unit and mocked API tests. Validate actual
OSRM with `scripts.check_osrm` separately.

Files: `backend/main.py`, `tests/test_api.py`, backend test configuration.
Acceptance: Developer A can run Python tests in a checkout with no frontend
dependencies or build, while real map serving still works after integration.
Verification: Run Python tests from a fresh backend-only setup; run the
frontend build and asset/browser integration checks afterward.
Dependencies: Task 1; can proceed alongside Tasks 2–3.

## Task 5: Add automated pull-request checks

Add a GitHub Actions workflow with backend tests, frontend unit/build checks,
API-contract drift checks, and browser integration checks. Use Python 3.14
and an explicitly pinned supported Node version, matching the verified local
environment where practical. Install from `requirements.txt` and the npm
lockfile with dependency scripts disabled.

Run browser checks against a temporary local app and use the same explicit
fixtures as local tests. Keep the backend and frontend checks independently
runnable. A full regional OSRM download is a local integration check, not a
required network-heavy step on every pull request.

Files: `.github/workflows/checks.yml`, browser-test configuration,
contract-check entry point if needed.
Acceptance: A pull request reports backend, frontend, contract and browser
results. A failing test or stale API snapshot causes the relevant check to fail.
Verification: Run the check commands locally, then inspect an actual workflow
run after an authorized push. Optional branch protection is configured by
the repository owner once the checks are available.
Dependencies: Tasks 2–4.

## Task 6: Document and verify the two-person handoff

Document clone/setup commands, developer ownership, mock versus live mode,
ports, dependency changes, contract updates, and the review process. Keep
the existing `scripts/start.ps1` as the combined real-app launcher.

Demonstrate Developer A changing backend behavior while Developer B changes
a map interaction in a separate workspace. Integrate both through reviewed
pull requests and verify the combined app against real local OSRM once
Docker and the road extract are ready.

Files: `CONTRIBUTING.md`, `README.md`,
`QuantumRescue_Implementation_Plan.md`, `tasks/todo.md`.
Acceptance: Both developers can work independently, their changes integrate,
and the final map uses the actual API without a hidden mock fallback.
Verification: Complete both developer setup paths and the integration
checklist. Keep live OSRM status pending until its real smoke check passes.
Dependencies: Tasks 3–5; live OSRM verification also requires Docker/map data.

## Delivery order

First establish the baseline and contract. Then frontend independence and
backend independence can proceed simultaneously. Add automated checks and
verify the shared workflow before continuing additional quantum features.
Task completion is tracked in [todo.md](todo.md).

## Risks and decisions

- Existing unfinished changes need review before a shared baseline is published.
- API-model changes affect both developers; update the contract and fixtures
  in the same change and tell the other developer before integration.
- Basemap tiles still require internet even in mock routing mode.
- A shared OSRM service is optional. Prefer each developer's own local services;
  exposing routing or the API on a network requires a separate access decision.
- GitHub collaborator invitations and branch-protection settings require
  repository-owner access; adding local documentation does not grant it.
- This work enables two developers. It does not introduce live collaborative
  editing or multi-user application sessions.

## Resource allocation pivot — 1 November 2026

The active product plan is now [the allocation implementation plan](../QuantumRescue_Implementation_Plan.md).
The collaboration tasks above remain valid infrastructure work. Product build order:
scenario + exact/QUBO -> QAOA -> allocation API/map -> verification/configuration.
The previous requirement to finish live OSRM before quantum work is superseded;
synthetic allocation and live road-routing modes must be explicitly distinguished.

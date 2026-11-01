# Working together on QuantumRescue

Use separate clones and task branches. Never let two people edit the same
checkout at the same time. The first common baseline is published on
`codex/shared-baseline` in [draft pull request #1](https://github.com/Alan-Saju/QuantumHack/pull/1);
use that branch until its pull request is merged,
then use `main`. Both developers should start from the same commit.

## Responsibilities

- Backend/OSRM owner: `backend/`, `osrm/`, Python tests, `requirements.txt`
  and generated API contracts. Continue the real road-network validation.
- Frontend/map owner: `frontend/`, its dependency lockfile, map controls,
  responsive layouts and browser tests.
- Agree who owns each change to root documentation, `scripts/start.ps1`,
  the implementation plan and future CI files before editing them.

These boundaries reduce conflicts; either developer can contribute elsewhere
with coordination. Request review from the other developer before merging.

## Repository access and first clone

The owner is `Alan-Saju`; the second developer is `Abhinand442`.
`Abhinand442` has write permission, verified through GitHub on 1 November
2026. Each person uses their own GitHub sign-in and Git author identity.
Never share access tokens, credentials, or virtual environments.

```powershell
git clone --branch codex/shared-baseline https://github.com/Alan-Saju/QuantumHack.git
cd QuantumHack
git rev-parse HEAD
git switch -c codex/my-task
```

Compare the printed baseline revision before beginning. After the baseline
pull request merges, clone normally without `--branch`, or switch to `main`
and run `git pull --ff-only`. Do not overwrite local changes to change branches.

The saved baseline was verified from a fresh clone: the frontend build,
4 frontend unit tests, 35 Python tests, and API contract check pass. The
browser regression suite also passes with shared synthetic fixtures. Two
isolated test checkouts successfully created separate task branches from
the same revision. Each developer still needs to confirm their own setup.

## Backend-only setup

Use Python 3.14 and Node.js 22 or newer; the baseline was verified with
Python 3.14.4 and Node.js 26.1.0. Run from the repository root:

```powershell
python -m venv qiskit-env
.\qiskit-env\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
.\qiskit-env\Scripts\python.exe -m pytest -q
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts --check
```

Python tests inject temporary test assets through
`create_app(frontend_dist=...)` and require neither Node, frontend build output,
nor Docker. The API preserves setup instructions at `/` if the real build is absent.
Start just the API with:

```powershell
.\qiskit-env\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## Frontend-only setup

Only Node.js 22 or newer is required for mock development:

```powershell
npm.cmd --prefix frontend ci --ignore-scripts
npm.cmd --prefix frontend run dev:mock
```

Open `http://127.0.0.1:5173/`. Source changes take effect on page reload; no
build step, Python process or Docker engine is needed. A persistent
**Synthetic demo data** banner identifies mock mode. Routes are fixed
contract examples and do not follow changed coordinates. Basemap tiles still
require internet. Select an error scenario before restarting the runner:

```powershell
$env:MOCK_SCENARIO = 'service-failure'
npm.cmd --prefix frontend run dev:mock
```

Available scenarios: `success`, `no-route`, `rejected`, `service-failure`.
Run `npm.cmd --prefix frontend test` for unit/runner checks and
`npm.cmd --prefix frontend run build` for the distributable map assets.
To integrate with a running backend instead:

```powershell
$env:PORT = '5174'
$env:BACKEND_TARGET = 'http://127.0.0.1:8001'
npm.cmd --prefix frontend run dev
```

Default frontend port is 5173 and backend target is `http://127.0.0.1:8000`.
Both runners bind to loopback; backend targets must be loopback HTTP origins.
Browser API calls stay relative to `/api/`. Live mode forwards response bodies
and statuses; connection failures return `BACKEND_UNAVAILABLE` (503), never
synthetic routes. Use `Remove-Item Env:PORT`, `Remove-Item Env:BACKEND_TARGET`
and `Remove-Item Env:MOCK_SCENARIO` to clear variables after changing modes.

## Combined app and browser verification

To run the combined map:

```powershell
.\scripts\start.ps1
```

Open `http://127.0.0.1:8000/`. Real routes require local OSRM and a matching
road-attribute index; follow README.md for map download and preparation.
Without OSRM, the map reports unavailable routing rather than using fixtures.

For repeatable integration checks, install Microsoft Edge on Windows, build
the frontend, and run:

```powershell
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:integration
```

This starts a temporary FastAPI process on an available port, verifies real
built assets and map interactions, then runs all four mock scenarios in
Node-only servers. Every temporary process is closed afterward. Routes and
tiles are synthetic in these tests; they do not certify real OSRM readiness.
Screenshots go to ignored `frontend/test-results/`.

On Linux, or to use downloaded Chromium instead of Edge:

```powershell
cd frontend
npx --no-install playwright-core install chromium
cd ..
$env:BROWSER_CHANNEL = 'chromium'
npm.cmd --prefix frontend run test:integration
```

Set `PYTHON` to a Python executable if it is neither in `qiskit-env` nor on PATH.
To test an already running app instead, set `APP_URL` and run:

```powershell
npm.cmd --prefix frontend run test:browser
```

For two checkouts on one computer, use different ports, for example
`.\scripts\start.ps1 -Port 8001`, and set `$env:APP_URL = 'http://127.0.0.1:8001'`
before browser tests. Keep dependencies, build output and local data in each
checkout. Do not reprocess the same Docker-mounted data concurrently.

## API changes

Backend models are the source of truth. Read `contracts/openapi.json` and
`contracts/README.md`; use `contracts/fixtures/` as the shared examples.
An endpoint/model change must include regeneration and relevant tests:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts --check
```

Coordinate breaking changes with the other developer before editing. The
current frontend supports the classical route response; quantum endpoints
are not part of this baseline.

## Branches, pull requests and merges

1. Start from the latest reviewed baseline (`main` after the baseline merges).
2. Create a short-lived branch such as `codex/map-controls` or `codex/osrm-fix`.
3. Make a focused change, run relevant checks and commit it.
4. Push your branch and open a pull request targeting `main`.
5. Describe behavior, tests and any contract changes. Request review from
   the other developer. Resolve conflicts on your branch and rerun checks.
6. Merge after review and checks pass. Each developer updates their local
   `main` before starting another task.

While the baseline pull request is open, either wait for its merge or base
your work on the same `codex/shared-baseline` revision and explicitly note
that dependency in your pull request. Do not push task changes directly onto
the shared baseline branch. Never force-push shared branches.

Commit source, tests and lockfiles. Do not commit `qiskit-env/`,
`frontend/node_modules/`, `frontend/dist/`, screenshots, `.env` files,
credentials, downloaded maps or generated routing graphs.

## Automated checks and integration handoff

`.github/workflows/checks.yml` defines backend, frontend, contracts and browser
jobs for pull requests, pushes to `main` and manual runs. Python is 3.14 and
Node is pinned to 22.14.0. Dependency installation uses the Python pins and npm
lockfile with npm install scripts disabled. Backend and contract jobs install
no frontend dependencies. Browser CI installs the pinned Playwright Chromium
and runs against a temporary app; no OSRM download or Docker service is needed.
An actual hosted run and branch protection remain pending until this workflow
is pushed and reviewed. Include local results in the PR meanwhile.

Before handing off a dependency change, update `requirements.txt` or
`frontend/package-lock.json` with the appropriate package manager, reinstall
from the pinned files, and rerun the affected checks. API changes also require
the contract export and shared fixture checks described above.

For the two-person integration checkpoint:

1. Each developer confirms their own clone and the relevant setup path.
2. Backend owner runs Python tests and contract checks on their task branch;
   frontend owner runs frontend tests, build and mock runner on theirs.
3. Review both PRs, update them against the same baseline and resolve conflicts.
4. After combining reviewed changes, run all four check commands and browser
   integration checks. Confirm live mode with the intended local API port.
5. Start Docker Desktop and the prepared service with
   `docker compose -f osrm/docker-compose.yml up -d`, run
   `.\qiskit-env\Scripts\python.exe -m scripts.check_osrm`, and inspect the
   combined map with real routes. Download/preprocess only for first setup or
   intentional data/profile updates. Follow README.md for initial preparation.

Local synthetic checks do not count as two-person review, a hosted Actions
run, or real OSRM verification; track those separately in `tasks/todo.md`.
Access verification does not prove the other person's checkout is set up;
that person must clone and run these steps to confirm their environment.

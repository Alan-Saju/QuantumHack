# Working together on QuantumRescue

Use separate clones and task branches. Never let two people edit the same
checkout at the same time. The first common baseline is being prepared on
`codex/shared-baseline`; use that branch until its pull request is merged,
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

## Reproduce the baseline locally

Use Python 3.14 and Node.js 22 or newer; the baseline was verified with
Python 3.14.4 and Node.js 26.1.0. Run from the repository root:

```powershell
python -m venv qiskit-env
.\qiskit-env\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
npm.cmd --prefix frontend ci --ignore-scripts
npm.cmd --prefix frontend run build
.\qiskit-env\Scripts\python.exe -m pytest -q
npm.cmd --prefix frontend test
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts --check
```

At this baseline the asset-serving Python test requires the frontend build.
Backend-only testing without a frontend build is still a separate planned
task. The frontend also still uses FastAPI to run; frontend-only mock mode
is not implemented. Docker is unnecessary for the unit and mocked API tests.

To run the combined map:

```powershell
.\scripts\start.ps1
```

Open `http://127.0.0.1:8000/`. Real routes require local OSRM and a matching
road-attribute index; follow README.md for map download and preparation.
Without OSRM, the map reports unavailable routing rather than using fixtures.

For browser tests, install Microsoft Edge and keep the app running in another
terminal, then run:

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

Automated pull-request checks and branch protection are not configured by
this baseline. Until CI is added, include local check results in each PR.
Access verification does not prove the other person's checkout is set up;
that person must clone and run these steps to confirm their environment.

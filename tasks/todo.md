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

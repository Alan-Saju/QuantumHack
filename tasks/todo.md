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
- [ ] Task 3: Add explicit frontend mock mode and configurable live forwarding.
- [ ] Verify mock mode needs neither Python nor Docker and is visibly labeled.
- [ ] Task 4: Make backend tests independent of the frontend build.
- [ ] Retain built-asset coverage in browser integration checks.

## Checkpoint: independent development

- [ ] Frontend development works with the backend stopped.
- [ ] Backend tests work without frontend dependencies or generated assets.
- [ ] Live mode reports failures without substituting fixtures.

- [ ] Task 5: Add backend, frontend, contract and browser pull-request checks.
- [ ] Verify checks locally and inspect an authorized GitHub Actions run.
- [ ] Task 6: Complete developer setup and integration documentation.

## Checkpoint: integrated collaboration

- [ ] Review and combine changes from two independent branches.
- [ ] All automated checks pass after integration.
- [ ] Verify actual local OSRM and the combined map when Docker/data are ready.

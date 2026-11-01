# Shared API contract

`openapi.json` is generated from FastAPI and its Pydantic models. Both
developers should use it to coordinate request and response changes.
`fixtures/` contains **synthetic** POST `/api/emergency/route` examples for
success with alternatives, no route, rejected candidates, and OSRM failure.

Each fixture is an envelope: `request` is the POST body, `response` is the
JSON response body, and `status_code` is the HTTP status. Do not send the
envelope itself to the API. The `data_source` and `description` fields mark
test data; they are not additional fields in the live response contract.
Fixture runtime is fixed at zero. No fixture represents surveyed roads or
measured performance. Browser tests may reposition synthetic geometry to
follow changed inputs; its coordinates are not live routes.

Generate the schema and fixtures from the repository root:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts
```

Verify the checked-in files match the implementation:

```powershell
.\qiskit-env\Scripts\python.exe -m scripts.export_contracts --check
.\qiskit-env\Scripts\python.exe -m pytest tests/test_contracts.py -q
```

An API change must include regenerated files and updated consumers/tests in
the same pull request. Discuss breaking changes before implementation.
`tests/test_contracts.py` validates fixture models, replays fixtures through
the real FastAPI handlers with an injected OSRM provider, and checks for
schema drift. These checks need no live OSRM service. Browser tests consume
these same fixtures. Frontend-only mock-server mode is a later task.

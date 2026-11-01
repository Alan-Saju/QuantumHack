"""Local, stateless research API. Run bound to loopback only."""
import os
from functools import lru_cache
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import Field

from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import Model, RouteRequest, RouteResult
from backend.optimization.classical_optimizer import optimize
from backend.osrm.client import OSRMClient, OSRMError

app = FastAPI(title="QuantumRescue", version="0.1.0",
              description="Phases 1–3. Simulated traffic and classical candidate ranking. Research use only.")


@lru_cache
def get_roads() -> RoadIndex:
    path = os.environ.get("ROAD_INDEX_PATH")
    return RoadIndex.load(path) if path else RoadIndex({})


def get_osrm():
    with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
        yield OSRMClient(client, os.environ.get("OSRM_BASE_URL", "http://127.0.0.1:5000"))


@app.exception_handler(OSRMError)
def upstream_error(request: Request, exc: OSRMError):
    return JSONResponse(status_code=503, content={"error": {"code": "OSRM_UNAVAILABLE",
                        "message": "Local OSRM is unavailable or returned invalid routing data."}})


@app.exception_handler(RequestValidationError)
def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR",
                        "message": "Invalid request. Check the schema at /docs.",
                        "fields": [".".join(map(str, error["loc"])) for error in exc.errors()]}})


@app.get("/health")
def health():
    return {"status": "ok", "routing_readiness": "not_checked", "traffic_source": "simulated"}


Client = Annotated[OSRMClient, Depends(get_osrm)]
Roads = Annotated[RoadIndex, Depends(get_roads)]


@app.post("/api/emergency/route", response_model=RouteResult)
def route(body: RouteRequest, client: Client, roads: Roads):
    return optimize(client.routes(body.ambulance, body.emergency), roads, body)


@app.post("/api/emergency/simulate-traffic", response_model=RouteResult)
def simulate_traffic(body: RouteRequest, client: Client, roads: Roads):
    """Recalculate with the supplied scenario. No global traffic state is mutated."""
    return route(body, client, roads)


class BlockRequest(Model):
    route_request: RouteRequest
    segment_ids: list[str] = Field(min_length=1, max_length=1000)


@app.post("/api/emergency/block-road", response_model=RouteResult)
def block_road(body: BlockRequest, client: Client, roads: Roads):
    updated = body.route_request.model_copy(deep=True)
    updated.scenario.overrides.update({segment_id: "blocked" for segment_id in body.segment_ids})
    return route(updated, client, roads)

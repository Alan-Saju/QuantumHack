"""Local, stateless research API. Run bound to loopback only."""
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, FastAPI, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import Field

from backend.allocation.scenario import AllocationRequest, demo_scenario, VehicleType, VehicleProfile, VEHICLE_PROFILES
from backend.allocation.service import AllocationResult, allocate
from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import ErrorResponse, HealthResult, Location, MapConfig, Model, ReadinessResult, RouteRequest, RouteResult
from backend.optimization.classical_optimizer import optimize
from backend.osrm.client import OSRMClient, OSRMError, OSRMNoSegmentError
from backend.hospitals import HospitalDirectory, HospitalSearch, HospitalIndexError

router = APIRouter()
FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
ROUTE_ERRORS = {422: {"model": ErrorResponse, "description": "Invalid route request"},
                503: {"model": ErrorResponse, "description": "OSRM or configured road data is unavailable"}}


class RoadConfigurationError(Exception):
    """Configured road data cannot be loaded."""


class RevalidatingStaticFiles(StaticFiles):
    """Unversioned local build assets must be checked on each page reload."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers['Cache-Control'] = 'no-cache'
        return response


@lru_cache
def get_roads() -> RoadIndex:
    path = os.environ.get("ROAD_INDEX_PATH")
    try:
        return RoadIndex.load(path) if path else RoadIndex({})
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise RoadConfigurationError("Road attribute index is invalid") from exc


def get_osrm():
    with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
        yield OSRMClient(client, os.environ.get("OSRM_BASE_URL", "http://127.0.0.1:5000"))


@lru_cache
def get_hospital_directory():
    path = Path(os.environ.get('HOSPITAL_INDEX_PATH', Path(__file__).resolve().parents[1] / 'data/hospitals/hospitals.json'))
    try:
        return HospitalDirectory.load(path)
    except (OSError, ValueError, TypeError) as exc:
        raise HospitalIndexError('Hospital catalogue is unavailable') from exc


@router.get('/api/hospitals', response_model=HospitalSearch, responses={422: {'model': ErrorResponse}, 503: {'model': ErrorResponse}})
def hospitals_in_view(south: Annotated[float, Query(ge=-90, le=90)], west: Annotated[float, Query(ge=-180, le=180)],
                      north: Annotated[float, Query(ge=-90, le=90)], east: Annotated[float, Query(ge=-180, le=180)],
                      limit: Annotated[int, Query(ge=1, le=200)] = 100):
    if south >= north or west >= east:
        return JSONResponse(status_code=422, content={'error': {'code': 'INVALID_BOUNDS', 'message': 'Choose a valid map area.'}})
    directory = get_hospital_directory()
    places = [h for h in directory.hospitals if south <= h.latitude <= north and west <= h.longitude <= east]
    return HospitalSearch(hospitals=places[:limit], truncated=len(places) > limit, indexed_at=directory.generated_at)


def hospital_index_error(request: Request, exc: HospitalIndexError):
    return JSONResponse(status_code=503, content={'error': {'code': 'HOSPITAL_INDEX_UNAVAILABLE',
                        'message': 'Hospital locations are unavailable. Build the hospital index from the local map extract and restart the backend.'}})


def upstream_error(request: Request, exc: OSRMError):
    return JSONResponse(status_code=503, content={"error": {"code": "OSRM_UNAVAILABLE",
                        "message": "Local OSRM is unavailable or returned invalid routing data."}})


def location_error(request: Request, exc: OSRMNoSegmentError):
    return JSONResponse(status_code=422, content={"error": {"code": "LOCATION_NOT_ROUTABLE", "message": str(exc)}})


def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR",
                        "message": "Invalid request. Check the schema at /docs.",
                        "fields": [".".join(map(str, error["loc"])) for error in exc.errors()]}})


def road_configuration_error(request: Request, exc: RoadConfigurationError):
    return JSONResponse(status_code=503, content={"error": {"code": "ROAD_INDEX_UNAVAILABLE",
                        "message": "The configured road attribute index could not be loaded. Rebuild the index and restart the app."}})


@router.get("/health", response_model=HealthResult)
def health():
    return {"status": "ok", "routing_readiness": "not_checked", "traffic_source": "simulated"}


Client = Annotated[OSRMClient, Depends(get_osrm)]
Roads = Annotated[RoadIndex, Depends(get_roads)]


@router.get('/api/allocation/demo', response_model=AllocationRequest, responses={422: {'model': ErrorResponse}})
def allocation_demo(hospital_count: Literal['3', '5'] = '3'):
    return demo_scenario(int(hospital_count))


@router.get('/api/allocation/vehicle-profiles', response_model=dict[VehicleType, VehicleProfile])
def allocation_vehicle_profiles():
    """Editable demo presets shared with the frontend; not certified fleet measurements."""
    return VEHICLE_PROFILES


@router.post('/api/allocation/optimize', response_model=AllocationResult, responses=ROUTE_ERRORS)
def allocation_optimize(body: AllocationRequest, client: Client):
    # Synthetic estimates do not depend on a configured road index.
    roads = get_roads() if body.travel_source == 'osrm' else None
    return allocate(body, client, roads)


@router.get("/api/readiness", response_model=ReadinessResult)
def readiness(client: Client):
    """Probe local OSRM at Kochi; this does not certify all routing services."""
    connected = False
    try:
        nearest = client.nearest(Location(latitude=9.9312, longitude=76.2673))
        lon, lat = nearest["waypoints"][0]["location"]
        Location(latitude=lat, longitude=lon)
        connected = True
    except (OSRMError, ValueError, KeyError, IndexError, TypeError):
        pass
    try:
        roads = get_roads()
        road_status = "loaded" if roads.edges else "not_configured"
    except RoadConfigurationError:
        road_status = "invalid"
    return {"osrm": "available" if connected else "unavailable", "road_attributes": road_status,
            "probe": "nearest at Kochi; run scripts.check_osrm to verify Route and Table"}


@router.get("/api/map-config", response_model=MapConfig, responses={503: {"model": ErrorResponse}})
def map_config():
    url = os.environ.get("MAP_TILE_URL", "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or any(key not in url for key in ("{z}", "{x}", "{y}")):
        return JSONResponse(status_code=503, content={"error": {"code": "MAP_CONFIG_INVALID",
                            "message": "MAP_TILE_URL must be an HTTP(S) tile template with {z}, {x} and {y}."}})
    return {"tile_url": url, "tile_attribution": os.environ.get("MAP_TILE_ATTRIBUTION", "© OpenStreetMap contributors")}


@router.post("/api/emergency/route", response_model=RouteResult, responses=ROUTE_ERRORS)
def route(body: RouteRequest, client: Client, roads: Roads):
    return optimize(client.routes(body.ambulance, body.emergency), roads, body)


@router.post("/api/emergency/simulate-traffic", response_model=RouteResult, responses=ROUTE_ERRORS)
def simulate_traffic(body: RouteRequest, client: Client, roads: Roads):
    """Recalculate with the supplied scenario. No global traffic state is mutated."""
    return route(body, client, roads)


class BlockRequest(Model):
    route_request: RouteRequest
    segment_ids: list[str] = Field(min_length=1, max_length=1000)


@router.post("/api/emergency/block-road", response_model=RouteResult, responses=ROUTE_ERRORS)
def block_road(body: BlockRequest, client: Client, roads: Roads):
    updated = body.route_request.model_copy(deep=True)
    updated.scenario.overrides.update({segment_id: "blocked" for segment_id in body.segment_ids})
    return route(updated, client, roads)


def create_app(*, frontend_dist: Path | None = None) -> FastAPI:
    """Build an isolated app; tests can supply assets without a Node installation."""
    assets = FRONTEND_DIST if frontend_dist is None else Path(frontend_dist)
    application = FastAPI(title="QuantumRescue", version="0.2.0",
                         description="Joint emergency resource allocation with QUBO, local QAOA and an exact baseline. Research use only.")
    application.add_exception_handler(OSRMError, upstream_error)
    application.add_exception_handler(OSRMNoSegmentError, location_error)
    application.add_exception_handler(RequestValidationError, validation_error)
    application.add_exception_handler(RoadConfigurationError, road_configuration_error)
    application.add_exception_handler(HospitalIndexError, hospital_index_error)
    application.include_router(router)

    @application.get("/", include_in_schema=False)
    def map_home():
        index = assets / "allocation.html"
        if not index.is_file():
            index = assets / "index.html"
        if not index.is_file():
            return HTMLResponse("<h1>Build the map frontend</h1><p>Run <code>npm --prefix frontend ci --ignore-scripts</code> and <code>npm --prefix frontend run build</code>, then reload.</p>", status_code=503)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    @application.get('/routes', include_in_schema=False)
    def route_inspector():
        index = assets / 'index.html'
        if not index.is_file():
            return map_home()
        return FileResponse(index, headers={'Cache-Control': 'no-cache'})


    # Same-origin assets avoid permissive CORS in the combined app.
    # https://fastapi.tiangolo.com/tutorial/static-files/
    application.mount("/assets", RevalidatingStaticFiles(directory=assets, check_dir=False), name="map-assets")
    return application


app = create_app()

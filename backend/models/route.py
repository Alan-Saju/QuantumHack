from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

NonNegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
TrafficLevel = Literal["low", "medium", "high", "blocked"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class APIError(Model):
    code: str
    message: str
    fields: list[str] | None = None


class ErrorResponse(Model):
    error: APIError


class HealthResult(Model):
    status: Literal["ok"]
    routing_readiness: Literal["not_checked"]
    traffic_source: Literal["simulated"]


class ReadinessResult(Model):
    osrm: Literal["available", "unavailable"]
    road_attributes: Literal["loaded", "not_configured", "invalid"]
    probe: str


class MapConfig(Model):
    tile_url: str
    tile_attribution: str


class Location(Model):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class Ambulance(Location):
    width_m: Positive = 2.4
    height_m: Positive = 2.8
    weight_t: Positive = 3.5


class Weights(Model):
    time: NonNegative = 1
    congestion: NonNegative = 0
    suitability: NonNegative = 1
    risk: NonNegative = 1


class Scenario(Model):
    seed: int = 0
    overrides: dict[str, TrafficLevel] = Field(default_factory=dict, max_length=10000)


class OptimizationOptions(Model):
    algorithm: Literal["classical"] = "classical"
    consider_traffic: bool = True
    consider_road_width: bool = True
    consider_risk: bool = True


class RouteRequest(Model):
    ambulance: Ambulance
    emergency: Location
    optimization: OptimizationOptions = Field(default_factory=OptimizationOptions)
    scenario: Scenario = Field(default_factory=Scenario)
    weights: Weights = Field(default_factory=Weights)
    require_known_width: bool = False


class Geometry(Model):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]] = Field(min_length=2)


class Segment(Model):
    id: str
    source: int
    target: int
    distance_m: NonNegative
    duration_s: NonNegative


class Candidate(Model):
    id: str
    distance_m: NonNegative
    duration_s: NonNegative
    geometry: Geometry
    segments: list[Segment] = Field(min_length=1)


class RoadAttributes(Model):
    matched: bool = False
    way_id: int | None = None
    width_m: Positive | None = None
    maxwidth_m: Positive | None = None
    maxheight_m: Positive | None = None
    maxweight_t: Positive | None = None
    direction_allowed: bool = True
    tags: dict[str, str] = Field(default_factory=dict)


class Cost(Model):
    travel_time_s: NonNegative = 0
    congestion_penalty_s: NonNegative = 0
    suitability_penalty_s: NonNegative = 0
    risk_penalty_s: NonNegative = 0
    total: NonNegative = 0


class ScoredSegment(Segment):
    road: RoadAttributes
    traffic: TrafficLevel


class ScoredRoute(Model):
    id: str
    distance_m: NonNegative
    estimated_time_s: NonNegative
    geometry: Geometry
    feasible: bool
    rejection_reasons: list[str]
    warnings: list[str]
    cost: Cost
    segments: list[ScoredSegment]


class RouteResult(Model):
    status: Literal["success", "no_feasible_route"]
    classical_route: ScoredRoute | None
    fallback_route: ScoredRoute | None
    candidates: list[ScoredRoute]
    classical_runtime_ms: NonNegative
    traffic_source: Literal["simulated"] = "simulated"
    scenario: Scenario
    scope: str = "Best among OSRM candidates; feasibility checks known restrictions only."

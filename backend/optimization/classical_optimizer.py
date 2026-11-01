from time import perf_counter

from backend.intelligence.cost_calculator import calculate_cost, road_coverage
from backend.intelligence.road_analyzer import RoadIndex
from backend.intelligence.traffic_analyzer import traffic_level
from backend.models.route import Candidate, RouteRequest, RouteResult, ScoredRoute, ScoredSegment
from backend.optimization.route_validator import validate_route


def optimize(candidates: list[Candidate], roads: RoadIndex, request: RouteRequest) -> RouteResult:
    start = perf_counter()
    scored = []
    for candidate in candidates:
        segments = [ScoredSegment(**segment.model_dump(), road=roads.lookup(segment.id),
                                  traffic=traffic_level(segment.id, request.scenario))
                    for segment in candidate.segments]
        reasons, warnings = validate_route(segments, request)
        turn_time = max(0, candidate.duration_s - sum(s.duration_s for s in segments))
        cost = calculate_cost(segments, turn_time, request)
        scored.append(ScoredRoute(id=candidate.id, distance_m=candidate.distance_m,
                                  geometry=candidate.geometry, estimated_time_s=cost.travel_time_s,
                                  feasible=not reasons, rejection_reasons=reasons,
                                  warnings=warnings, cost=cost, segments=segments, road_coverage=road_coverage(segments)))
    feasible = [route for route in scored if route.feasible]
    best = min(feasible, key=lambda route: (route.cost.total, route.id), default=None)
    return RouteResult(status="success" if best else "no_feasible_route", classical_route=best,
                       fallback_route=scored[0] if scored and scored[0].feasible else None,
                       candidates=scored, scenario=request.scenario.model_copy(deep=True),
                       classical_runtime_ms=(perf_counter() - start) * 1000)

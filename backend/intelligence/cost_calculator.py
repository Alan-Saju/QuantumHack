from backend.intelligence.traffic_analyzer import SPEED_FACTORS
from backend.models.route import Cost, RouteRequest, ScoredSegment


def calculate_cost(segments: list[ScoredSegment], turn_time_s: float, request: RouteRequest) -> Cost:
    """All penalties are experimental seconds-equivalent, weighted once."""
    travel = turn_time_s
    congestion = suitability = risk = 0.0
    for segment in segments:
        delay = segment.duration_s * (1 / SPEED_FACTORS[segment.traffic] - 1)
        if request.optimization.consider_traffic:
            travel += segment.duration_s + delay
            congestion += delay
        else:
            travel += segment.duration_s
        if request.optimization.consider_road_width and segment.road.width_m is None:
            suitability += 30
        if request.optimization.consider_risk and segment.road.tags.get("surface") in {
            "unpaved", "gravel", "ground", "sand", "mud"
        }:
            risk += segment.duration_s * 0.5
    weights = request.weights
    return Cost(travel_time_s=travel, congestion_penalty_s=congestion,
                suitability_penalty_s=suitability, risk_penalty_s=risk,
                total=weights.time * travel + weights.congestion * congestion
                + weights.suitability * suitability + weights.risk * risk)

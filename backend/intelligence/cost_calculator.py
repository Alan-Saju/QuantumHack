from backend.intelligence.traffic_analyzer import SPEED_FACTORS
from backend.models.route import Cost, RoadCoverage, RouteRequest, ScoredSegment


# Research preference factors, not speed estimates or medical risk probabilities.
SURFACE_FACTORS = {
    'asphalt': 0, 'concrete': 0, 'paved': 0,
    'paving_stones': 0.25, 'sett': 0.25,
    'gravel': 0.5, 'fine_gravel': 0.5, 'compacted': 0.5, 'unpaved': 0.5,
    'ground': 1, 'dirt': 1, 'earth': 1, 'sand': 1, 'mud': 1,
}


def road_coverage(segments: list[ScoredSegment]) -> RoadCoverage:
    known_width = [s for s in segments if s.road.matched and s.road.width_m is not None]
    known_surface = [s for s in segments if s.road.matched and s.road.tags.get('surface') in SURFACE_FACTORS]
    total_time = sum(s.duration_s for s in segments)
    return RoadCoverage(segment_count=len(segments), matched_count=sum(s.road.matched for s in segments),
                        known_width_count=len(known_width), known_surface_count=len(known_surface),
                        segment_time_s=total_time,
                        unknown_width_time_s=max(0, total_time - sum(s.duration_s for s in known_width)),
                        unknown_surface_time_s=max(0, total_time - sum(s.duration_s for s in known_surface)))


def calculate_cost(segments: list[ScoredSegment], turn_time_s: float, request: RouteRequest) -> Cost:
    """All penalties are experimental seconds-equivalent, weighted once."""
    travel = turn_time_s
    congestion = narrowness = surface = uncertainty = 0.0
    for segment in segments:
        delay = segment.duration_s * (1 / SPEED_FACTORS[segment.traffic] - 1)
        if request.optimization.consider_traffic:
            travel += segment.duration_s + delay
            congestion += delay
        else:
            travel += segment.duration_s
        width = segment.road.width_m if segment.road.matched else None
        factor = SURFACE_FACTORS.get(segment.road.tags.get('surface')) if segment.road.matched else None
        if request.optimization.consider_road_width:
            if width is None:
                uncertainty += segment.duration_s * 0.7
            else:
                # One metre of extra nominal width is a demo preference, not certified clearance.
                narrowness += segment.duration_s * max(0, min(1, 1 - (width - request.ambulance.width_m)))
        if request.optimization.consider_risk:
            if factor is None:
                uncertainty += segment.duration_s * 0.3
            else:
                surface += segment.duration_s * factor
    weights = request.weights
    suitability, risk, unknown = 0.5 * narrowness, 0.3 * surface, 0.2 * uncertainty
    return Cost(travel_time_s=travel, congestion_penalty_s=congestion,
                suitability_penalty_s=suitability, risk_penalty_s=risk,
                uncertainty_penalty_s=unknown, narrowness_exposure_s=narrowness,
                surface_exposure_s=surface, uncertainty_exposure_s=uncertainty,
                total=weights.time * travel + weights.congestion * congestion
                + weights.suitability * suitability + weights.risk * risk + weights.uncertainty * unknown)

"""Typed travel legs shared by candidate generation and the allocation API."""
from math import asin, cos, radians, sin, sqrt

from pydantic import Field

from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import Cost, Geometry, Model, RoadCoverage, RouteRequest
from backend.optimization.classical_optimizer import optimize
from backend.osrm.client import OSRMNoSegmentError


class TravelLeg(Model):
    geometry: Geometry
    cost: Cost
    road_coverage: RoadCoverage | None = None
    warnings: list[str] = Field(default_factory=list)


def synthetic_leg(start, end, vehicle):
    a, b = radians(start.latitude), radians(end.latitude)
    dlat, dlon = b - a, radians(end.longitude - start.longitude)
    distance_km = 12742 * asin(sqrt(min(1, sin(dlat / 2)**2 + cos(a) * cos(b) * sin(dlon / 2)**2)))
    seconds = distance_km / 30 * 3600
    return TravelLeg(geometry=Geometry(coordinates=[(start.longitude, start.latitude), (end.longitude, end.latitude)]),
                     cost=Cost(travel_time_s=seconds, total=seconds))


class RoadTravel:
    """Reuse OSRM geometry, but validate and score each vehicle independently."""

    def __init__(self, scenario, client, roads: RoadIndex):
        self.scenario, self.client, self.roads = scenario, client, roads
        self.routes = {}
        self.warnings = []

    def __call__(self, start, end, vehicle):
        key = (start.latitude, start.longitude, end.latitude, end.longitude)
        if key not in self.routes:
            try:
                self.routes[key] = self.client.routes(start, end)
            except OSRMNoSegmentError:
                self.routes[key] = []
        request = RouteRequest(
            ambulance={'latitude': start.latitude, 'longitude': start.longitude,
                       'width_m': vehicle.width_m, 'height_m': vehicle.height_m, 'weight_t': vehicle.weight_t},
            emergency={'latitude': end.latitude, 'longitude': end.longitude},
            optimization={'consider_traffic': self.scenario.consider_traffic},
            scenario=self.scenario.road_scenario, require_known_width=self.scenario.require_known_width)
        result = optimize(self.routes[key], self.roads, request)
        chosen = result.classical_route
        if chosen is None:
            reasons = {reason.partition(': ')[2] or reason for route in result.candidates for reason in route.rejection_reasons}
            detail = '; '.join(sorted(reasons)) or 'no routable road or connecting route'
            self.warnings.append(f'No feasible road route {start.id} → {end.id} for {vehicle.id}: {detail}.')
            return None
        warnings = list(dict.fromkeys(w.partition(': ')[2] or w for w in chosen.warnings))
        if chosen.road_coverage.known_surface_count < chosen.road_coverage.segment_count:
            warnings.append('Surface information is missing or unrecognized on some segments.')
        return TravelLeg(geometry=chosen.geometry, cost=chosen.cost,
                         road_coverage=chosen.road_coverage, warnings=warnings)

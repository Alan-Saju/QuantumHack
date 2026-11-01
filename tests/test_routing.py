import pytest

from backend.models.route import Ambulance, RouteRequest, Scenario
from backend.osrm.route_generator import parse_routes
from backend.intelligence.road_analyzer import RoadIndex
from backend.intelligence.traffic_analyzer import traffic_level
from backend.optimization.classical_optimizer import optimize


def payload():
    def route(nodes, duration):
        return {
            "distance": 200, "duration": duration,
            "geometry": {"type": "LineString", "coordinates": [[76.2673, 9.9312], [76.2900, 9.95]]},
            "legs": [{"annotation": {"nodes": nodes, "distance": [100, 100],
                                       "duration": [duration / 2, duration / 2]}}],
        }
    return {"code": "Ok", "routes": [route([1, 2, 4], 20), route([1, 3, 4], 30)]}


def request(**kwargs):
    return RouteRequest(ambulance={"latitude": 9.9312, "longitude": 76.2673},
                        emergency={"latitude": 9.95, "longitude": 76.29}, **kwargs)


def index(tags=None):
    return RoadIndex({f"{a}:{b}": [{"way_id": a * 10 + b, "tags": tags or {"width": "4"},
                                     "direction_allowed": True}]
                      for a, b in [(1, 2), (2, 4), (1, 3), (3, 4)]})


def test_baseline_and_blockage_choose_alternative():
    routes = parse_routes(payload())
    result = optimize(routes, index(), request())
    assert result.classical_route.id == "osrm-0"
    assert result.fallback_route.id == "osrm-0"
    rerouted = optimize(routes, index(), request(scenario=Scenario(overrides={"1:2": "blocked"})))
    assert rerouted.classical_route.id == "osrm-1"
    assert rerouted.fallback_route is None
    assert not rerouted.candidates[0].feasible


@pytest.mark.parametrize("tags", [{"access": "no"}, {"maxwidth": "2"},
                                 {"maxheight": "2"}, {"maxweight": "2"}])
def test_hard_constraints_never_return_fallback(tags):
    result = optimize(parse_routes(payload()), index(tags), request())
    assert result.status == "no_feasible_route"
    assert result.classical_route is None and result.fallback_route is None


def test_unknown_attributes_are_visible_and_can_be_rejected():
    result = optimize(parse_routes(payload()), RoadIndex({}), request())
    assert result.classical_route.warnings
    assert result.classical_route.segments[0].road.width_m is None
    strict = optimize(parse_routes(payload()), RoadIndex({}), request(require_known_width=True))
    assert strict.status == "no_feasible_route"


def test_traffic_is_repeatable_and_changes_cost():
    scenario = Scenario(seed=42)
    assert traffic_level("1:2", scenario) == traffic_level("1:2", scenario)
    low = optimize(parse_routes(payload()), index(), request(scenario=Scenario(overrides={"1:2": "low"})))
    high = optimize(parse_routes(payload()), index(), request(scenario=Scenario(overrides={"1:2": "high"})))
    assert high.candidates[0].cost.travel_time_s > low.candidates[0].cost.travel_time_s
    assert high.candidates[0].cost.total > low.candidates[0].cost.total


def test_malformed_annotation_is_rejected():
    data = payload()
    data["routes"][0]["legs"][0]["annotation"]["nodes"] = [1, 2]
    with pytest.raises(ValueError):
        parse_routes(data)


def test_invalid_inputs():
    with pytest.raises(ValueError):
        Ambulance(latitude=91, longitude=76)
    with pytest.raises(ValueError):
        request(optimization={"algorithm": "QAOA"})
    with pytest.raises(ValueError):
        request(weights={"time": -1})


def test_hard_restrictions_cannot_be_disabled_by_scoring_options():
    body = request(optimization={"consider_traffic": False, "consider_road_width": False,
                                 "consider_risk": False},
                   scenario=Scenario(overrides={"1:2": "blocked", "1:3": "blocked"}))
    assert optimize(parse_routes(payload()), index(), body).status == "no_feasible_route"


def test_oneway_and_disconnected_paths_are_rejected():
    roads = index()
    roads.edges["1:2"][0]["direction_allowed"] = False
    assert optimize(parse_routes(payload()), roads, request()).classical_route.id == "osrm-1"
    routes = parse_routes(payload())[:1]
    routes[0].segments[1].source = 99
    assert optimize(routes, roads, request()).status == "no_feasible_route"


def test_result_keeps_original_scenario_snapshot():
    body = request(scenario=Scenario(overrides={"1:2": "low"}))
    result = optimize(parse_routes(payload()), index(), body)
    body.scenario.overrides["1:2"] = "blocked"
    assert result.scenario.overrides["1:2"] == "low"

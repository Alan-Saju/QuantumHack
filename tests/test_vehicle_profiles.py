import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.main import app
from backend.allocation.scenario import Ambulance, demo_scenario
from backend.allocation.travel import RoadTravel
from tests.test_allocation_roads import route, roads_for, small_scenario


def vehicle(**values):
    return Ambulance(id='A', name='Test', latitude=9.994, longitude=76.294,
                     capabilities=['general'], **values)


def test_profiles_fill_missing_dimensions_and_preserve_explicit_overrides():
    assert vehicle().vehicle_type == 'traveller'
    assert vehicle().width_m == 2.4
    compact = vehicle(vehicle_type='omini')
    assert (compact.width_m, compact.height_m, compact.weight_t) == (1.6, 2.0, 1.5)
    assert vehicle(vehicle_type='omini', width_m=1.8).width_m == 1.8
    assert vehicle(width_m=2.1).width_m == 2.1
    assert vehicle(vehicle_type='omini', width_m=1.8).height_m == 2.0


@pytest.mark.parametrize('values', [{'vehicle_type': 'unknown'}, {'vehicle_type': []},
    {'width_m': 0}, {'height_m': -1}, {'weight_t': float('nan')}, {'width_m': float('inf')}])
def test_invalid_profiles_and_dimensions_fail_validation(values):
    with pytest.raises(ValidationError):
        vehicle(**values)


def test_profile_api_matches_model_defaults_and_demo_contains_both_types():
    with TestClient(app) as client:
        response = client.get('/api/allocation/vehicle-profiles')
        assert response.status_code == 200
        for key, profile in response.json().items():
            ambulance = vehicle(vehicle_type=key)
            for field in ['width_m', 'height_m', 'weight_t']:
                assert getattr(ambulance, field) == profile[field]
        assert {a.vehicle_type for a in demo_scenario().ambulances} == {'traveller', 'omini'}


@pytest.mark.parametrize('limit', ['maxwidth', 'maxheight', 'maxweight'])
def test_vehicle_profiles_choose_different_routes_on_both_legs(limit):
    scenario = small_scenario()
    class Routes:
        def routes(self, start, end):
            return [route(1, 60, start, end), route(3, 120, start, end)]
    travel = RoadTravel(scenario, Routes(), roads_for({
        1: {limit: '2.1', 'width': '5', 'surface': 'asphalt'},
        3: {'width': '5', 'surface': 'asphalt'}}))
    for start, end in [(scenario.ambulances[0], scenario.incidents[0]),
                       (scenario.incidents[0], scenario.hospitals[0])]:
        assert travel(start, end, vehicle(vehicle_type='traveller')).cost.travel_time_s == 120
        assert travel(start, end, vehicle(vehicle_type='omini')).cost.travel_time_s == 60
        assert travel(start, end, vehicle(vehicle_type='traveller')).cost.travel_time_s == 120


def test_width_preference_can_change_the_route_without_a_hard_restriction():
    scenario = small_scenario()
    class Routes:
        def routes(self, start, end):
            return [route(1, 100, start, end), route(3, 120, start, end)]
    travel = RoadTravel(scenario, Routes(), roads_for({
        1: {'width': '2.5', 'surface': 'asphalt'},
        3: {'width': '4', 'surface': 'asphalt'}}))
    for start, end in [(scenario.ambulances[0], scenario.incidents[0]),
                       (scenario.incidents[0], scenario.hospitals[0])]:
        assert travel(start, end, vehicle(vehicle_type='traveller')).cost.travel_time_s == 120
        assert travel(start, end, vehicle(vehicle_type='omini')).cost.travel_time_s == 100

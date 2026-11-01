import pytest

from backend.intelligence.cost_calculator import calculate_cost
from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import ScoredSegment
from test_routing import request


def segment(duration=100, tags=None, source=1, target=2, traffic='low'):
    roads = RoadIndex({f'{source}:{target}': [{'way_id': 10, 'tags': tags or {}, 'direction_allowed': True}]})
    return ScoredSegment(id=f'{source}:{target}', source=source, target=target,
                         distance_m=100, duration_s=duration, traffic=traffic,
                         road=roads.lookup(f'{source}:{target}'))


def test_attribute_cost_keeps_eta_separate_and_matches_proposed_formula():
    road = segment(tags={'width': '2.9', 'surface': 'gravel'})
    cost = calculate_cost([road], 10, request())
    assert cost.travel_time_s == 110
    assert cost.narrowness_exposure_s == pytest.approx(50)
    assert cost.surface_exposure_s == 50
    assert cost.uncertainty_exposure_s == 0
    assert cost.suitability_penalty_s == pytest.approx(25)
    assert cost.risk_penalty_s == 15
    assert cost.total == pytest.approx(150)


def test_missing_data_penalty_is_exposure_weighted_and_split_invariant():
    one = calculate_cost([segment()], 10, request())
    split = calculate_cost([segment(25), segment(75, source=2, target=3)], 10, request())
    assert one.uncertainty_penalty_s == 20
    assert one.total == 130
    assert split == one
    known_surface = calculate_cost([segment(tags={'surface': 'asphalt'})], 0, request())
    assert known_surface.uncertainty_penalty_s == pytest.approx(14)


def test_traffic_changes_eta_once_and_disabled_preferences_have_no_penalties():
    road = segment(tags={'width': '4', 'surface': 'asphalt'}, traffic='high')
    cost = calculate_cost([road], 10, request())
    assert cost.total == pytest.approx(10 + 100 / 0.35)
    disabled = calculate_cost([segment(traffic='high')], 10,
                              request(optimization={'consider_traffic': False,
                                                    'consider_road_width': False, 'consider_risk': False}))
    assert disabled.total == disabled.travel_time_s == 110


def test_unrecognized_surface_remains_unknown_and_coefficients_are_weighted_once():
    body = request(weights={'time': 1, 'suitability': 2, 'risk': 3, 'uncertainty': 4})
    cost = calculate_cost([segment(tags={'width': '2.4', 'surface': 'alien'})], 0, body)
    assert cost.surface_exposure_s == 0
    assert cost.total == pytest.approx(100 + 2 * 50 + 4 * 6)

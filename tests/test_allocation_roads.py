import pytest
from fastapi.testclient import TestClient

from backend.allocation.scenario import demo_scenario
from backend.allocation.service import allocate
from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import Candidate, Geometry, Segment


def small_scenario():
    scenario = demo_scenario()
    scenario.travel_source = 'osrm'
    scenario.ambulances = scenario.ambulances[:1]
    scenario.incidents = scenario.incidents[:1]
    scenario.hospitals = scenario.hospitals[:1]
    return scenario


def route(identifier, seconds, start, end):
    return Candidate(id=str(identifier), distance_m=100, duration_s=seconds,
                     geometry=Geometry(coordinates=[(start.longitude, start.latitude), (end.longitude, end.latitude)]),
                     segments=[Segment(id=f'{identifier}:{identifier + 1}', source=identifier,
                                       target=identifier + 1, duration_s=seconds, distance_m=100)])


def roads_for(tags):
    return RoadIndex({f'{i}:{i + 1}': [{'way_id': i, 'tags': value, 'direction_allowed': True}]
                      for i, value in tags.items()})


def test_allocation_chooses_cheapest_feasible_road_cost_and_exposes_both_legs():
    scenario = small_scenario()
    class Routes:
        def routes(self, start, end):
            return [route(1, 60, start, end), route(3, 100, start, end), route(5, 120, start, end)]
    roads = roads_for({1: {'maxwidth': '1', 'surface': 'asphalt'},
                       3: {'width': '2.4', 'surface': 'asphalt'},
                       5: {'width': '4', 'surface': 'asphalt'}})
    result = allocate(scenario, Routes(), roads)
    choice = result.assignments[0]
    assert choice.response_minutes == choice.transport_minutes == 2
    assert choice.cost == 8  # severity 3 * response 2 + transport 2
    assert result.objective == result.exact_objective == result.reduced_exact_objective == 8
    assert len(choice.leg_details) == 2
    assert all(leg.cost.total == 120 and leg.road_coverage.matched_count == 1 for leg in choice.leg_details)


def test_vehicle_dimensions_apply_to_transport_and_do_not_leak_through_cache():
    scenario = small_scenario()
    wide = scenario.ambulances[0]
    wide.width_m = 3
    narrow = wide.model_copy(update={'id': 'A2', 'width_m': 2})
    scenario.ambulances.append(narrow)
    class Routes:
        calls = 0
        def routes(self, start, end):
            self.calls += 1
            return [route(1, 60, start, end)]
    routes = Routes()
    result = allocate(scenario, routes, roads_for({1: {'width': '4', 'maxwidth': '2.5', 'surface': 'asphalt'}}))
    assert result.assignments[0].ambulance_id == 'A2'
    assert routes.calls == 2  # Shared geometry fetched once per distinct endpoint pair.


@pytest.mark.parametrize('tags', [{'maxheight': '2'}, {'maxweight': '2'}, {'access': 'no'}, {'width': '2'}])
def test_transport_leg_restrictions_leave_incident_unserved(tags):
    scenario = small_scenario()
    class Routes:
        def routes(self, start, end):
            return [route(3 if end.id.startswith('H') else 1, 60, start, end)]
    result = allocate(scenario, Routes(), roads_for({1: {'width': '4', 'surface': 'asphalt'}, 3: tags}))
    assert result.unserved == ['I1']
    assert any('No feasible road route' in warning for warning in result.warnings)


def test_strict_width_closures_and_unroutable_points_never_use_synthetic_travel():
    from backend.osrm.client import OSRMNoSegmentError
    scenario = small_scenario()
    class Routes:
        def routes(self, start, end):
            return [route(1, 60, start, end)]
    scenario.require_known_width = True
    assert allocate(scenario, Routes(), RoadIndex({})).unserved == ['I1']
    scenario.require_known_width = False
    scenario.road_scenario.overrides['1:2'] = 'blocked'
    assert allocate(scenario, Routes(), roads_for({1: {'width': '4'}})).unserved == ['I1']
    class OffRoad:
        def routes(self, start, end):
            raise OSRMNoSegmentError('No road near endpoint')
    assert allocate(scenario, OffRoad(), RoadIndex({})).unserved == ['I1']


def test_synthetic_costs_have_no_road_claims_and_reject_invalid_dimensions():
    from pydantic import ValidationError
    scenario = demo_scenario()
    result = allocate(scenario)
    for choice in result.assignments:
        assert choice.cost == pytest.approx(scenario.incidents[int(choice.incident_id[1:]) - 1].severity
                                           * choice.response_minutes + scenario.transport_weight * choice.transport_minutes)
        assert all(leg.road_coverage is None and leg.cost.uncertainty_penalty_s == 0 for leg in choice.leg_details)
    data = scenario.model_dump()
    data['ambulances'][0]['height_m'] = 0
    with pytest.raises(ValidationError):
        type(scenario).model_validate(data)


def test_allocation_api_injects_index_only_for_road_mode(monkeypatch):
    import backend.main as main
    class Routes:
        def routes(self, start, end):
            return [route(1, 60, start, end)]
    main.app.dependency_overrides[main.get_osrm] = Routes
    monkeypatch.setattr(main, 'get_roads', lambda: roads_for({1: {'width': '4', 'surface': 'asphalt'}}))
    try:
        with TestClient(main.app) as client:
            result = client.post('/api/allocation/optimize', json=small_scenario().model_dump())
            assert result.status_code == 200
            assert result.json()['assignments'][0]['leg_details'][0]['road_coverage']['known_width_count'] == 1
            def invalid_index():
                raise main.RoadConfigurationError('bad file')
            monkeypatch.setattr(main, 'get_roads', invalid_index)
            assert client.post('/api/allocation/optimize', json=small_scenario().model_dump()).status_code == 503
            assert client.post('/api/allocation/optimize', json=demo_scenario().model_dump()).status_code == 200
    finally:
        main.app.dependency_overrides.clear()


def test_road_costs_are_identical_in_exact_qubo_and_quantum_models():
    from itertools import product
    from backend.allocation.qubo import build_problem, valid_bits
    from backend.allocation.travel import RoadTravel
    scenario = small_scenario()
    class Routes:
        def routes(self, start, end):
            return [route(1, 100, start, end)]
    roads = roads_for({1: {'width': '2.9', 'surface': 'gravel'}})
    problem = build_problem(scenario, RoadTravel(scenario, Routes(), roads))
    served = problem.full_groups[0][0]
    assert served.cost == pytest.approx(4 * 140 / 60)
    for bits in product((0, 1), repeat=len(problem.choices)):
        if valid_bits(problem, bits):
            assert problem.energy(bits) == pytest.approx(sum(c.cost for c, bit in zip(problem.choices, bits) if bit))
    pytest.importorskip('qiskit')
    scenario.solver.algorithm = 'qaoa'
    scenario.solver.maxiter = 10
    result = allocate(scenario, Routes(), roads)
    assert result.quantum.status == 'completed'
    assert result.exact_objective == pytest.approx(served.cost)
    assert result.objective == pytest.approx(result.exact_objective)
    assert all(leg.cost.total == pytest.approx(140) for leg in result.variables[0].leg_details)

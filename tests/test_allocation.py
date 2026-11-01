from itertools import product

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.allocation.scenario import demo_scenario
from backend.allocation.qubo import build_problem, exact_plan, valid_bits


def test_demo_allocates_three_without_double_booking():
    problem = build_problem(demo_scenario())
    plan = exact_plan(problem.full_groups)
    served = [c for c in plan if c.ambulance_id]
    assert len(served) == 3
    assert len({c.ambulance_id for c in served}) == 3
    assert len({c.hospital_id for c in served}) == 3


def test_qubo_ground_state_is_a_valid_reduced_optimum():
    problem = build_problem(demo_scenario())
    bits = min(product((0, 1), repeat=len(problem.choices)), key=problem.energy)
    assert valid_bits(problem, bits)
    assert problem.energy(bits) == pytest.approx(sum(c.cost for c, b in zip(problem.choices, bits) if b))
    assert problem.energy(bits) == pytest.approx(sum(c.cost for c in exact_plan(problem.groups)))


def test_unavailable_resources_leave_incidents_unserved():
    scenario = demo_scenario()
    for a in scenario.ambulances:
        a.available = False
    problem = build_problem(scenario)
    assert all(c.ambulance_id is None for c in exact_plan(problem.full_groups))


def test_allocation_api_and_validation():
    with TestClient(app) as client:
        scenario = client.get('/api/allocation/demo').json()
        assert len(scenario['hospitals']) == len(scenario['ambulances']) == len(scenario['incidents']) == 3
        response = client.post('/api/allocation/optimize', json=scenario)
        assert response.status_code == 200
        result = response.json()
        assert result['selected_solver'] == 'exact'
        assert len(result['assignments']) == 3
        scenario['ambulances'][1]['id'] = scenario['ambulances'][0]['id']
        assert client.post('/api/allocation/optimize', json=scenario).status_code == 422


def test_ising_matches_qubo_on_all_small_bitstrings():
    from backend.allocation.qaoa import ising_terms
    scenario = demo_scenario()
    scenario.incidents = scenario.incidents[:1]
    problem = build_problem(scenario)
    offset, z, zz = ising_terms(problem)
    for bits in product((0, 1), repeat=len(problem.choices)):
        spins = [1 - 2 * b for b in bits]
        energy = offset + sum(v * spins[i] for i, v in z.items()) + sum(v * spins[i] * spins[j] for (i, j), v in zz.items())
        assert energy == pytest.approx(problem.energy(bits))


def test_real_qaoa_sampling_and_validation():
    pytest.importorskip('qiskit')
    from backend.allocation.qaoa import solve_qaoa
    scenario = demo_scenario()
    scenario.incidents = scenario.incidents[:1]
    scenario.solver.maxiter = 10
    problem = build_problem(scenario)
    result = solve_qaoa(problem, scenario.solver)
    assert result.status == 'completed'
    assert result.evaluations > 0
    assert result.shots == scenario.solver.shots
    assert 0 <= result.feasible_probability <= 1
    assert result.assignments is not None
    assert result.circuit_depth > 0
    assert result.objective == pytest.approx(sum(c.cost for c in result.assignments))


def test_scarce_als_unit_prioritizes_higher_severity():
    scenario = demo_scenario()
    scenario.ambulances[1].available = False
    scenario.incidents[0].severity = 1
    scenario.incidents[1].severity = 3
    plan = exact_plan(build_problem(scenario).full_groups)
    assert next(c for c in plan if c.incident_id == 'I2').ambulance_id == 'A1'
    assert next(c for c in plan if c.incident_id == 'I1').ambulance_id is None


def test_occupied_cardiac_slot_cannot_receive_cardiac_incident():
    scenario = demo_scenario()
    scenario.hospitals[1].available_slots = 0
    plan = exact_plan(build_problem(scenario).full_groups)
    assert next(c for c in plan if c.incident_id == 'I2').ambulance_id is None
    assert all(c.hospital_id != 'H2' for c in plan)


def test_valid_bitstrings_have_objective_energy_and_conflicts_are_penalized():
    problem = build_problem(demo_scenario())
    valid_energies, invalid_energies = [], []
    for bits in product((0, 1), repeat=len(problem.choices)):
        if valid_bits(problem, bits):
            cost = sum(c.cost for c, b in zip(problem.choices, bits) if b)
            assert problem.energy(bits) == pytest.approx(cost)
            valid_energies.append(cost)
        else:
            invalid_energies.append(problem.energy(bits))
    assert min(invalid_energies) > min(valid_energies)


def test_live_osrm_uses_road_durations_and_unreachable_choices():
    from backend.allocation.service import allocate
    from backend.models.route import Candidate, Geometry, Segment
    class Routes:
        def routes(self, start, end):
            if start == scenario.incidents[1]:
                return []
            return [Candidate(id='road', distance_m=1000, duration_s=600,
                              geometry=Geometry(coordinates=[(start.longitude, start.latitude), (end.longitude, end.latitude)]),
                              segments=[Segment(id='1:2', source=1, target=2, distance_m=1000, duration_s=600)])]
    scenario = demo_scenario()
    scenario.travel_source = 'osrm'
    result = allocate(scenario, Routes())
    assert 'I2' in result.unserved
    assert all(c.response_minutes == 10 and c.transport_minutes == 10 for c in result.assignments if c.ambulance_id)
    assert result.travel_source == 'osrm'


def test_live_failure_is_not_replaced_with_synthetic_data():
    from backend.main import get_osrm
    from backend.osrm.client import OSRMError
    class Unavailable:
        def routes(self, start, end):
            raise OSRMError('upstream unavailable')
    app.dependency_overrides[get_osrm] = Unavailable
    try:
        with TestClient(app) as client:
            scenario = demo_scenario().model_dump()
            scenario['travel_source'] = 'osrm'
            response = client.post('/api/allocation/optimize', json=scenario)
            assert response.status_code == 503
            assert response.json()['error']['code'] == 'OSRM_UNAVAILABLE'
    finally:
        app.dependency_overrides.clear()


def test_qaoa_api_compares_full_and_reduced_models():
    pytest.importorskip('qiskit')
    with TestClient(app) as client:
        scenario = demo_scenario().model_dump()
        scenario['solver'].update(algorithm='qaoa', maxiter=10)
        response = client.post('/api/allocation/optimize', json=scenario)
    assert response.status_code == 200
    result = response.json()
    assert result['quantum']['status'] == 'completed'
    assert result['objective'] == pytest.approx(result['exact_objective'])
    assert result['reduced_exact_objective'] >= result['exact_objective'] - 1e-8
    assert result['qubit_count'] <= 12


def test_quantum_dependency_failure_is_explicit_classical_fallback(monkeypatch):
    from backend.allocation import service
    from backend.allocation.qaoa import QuantumResult
    monkeypatch.setattr(service, 'solve_qaoa', lambda *args: QuantumResult(status='unavailable', message='Dependencies missing'))
    scenario = demo_scenario()
    scenario.solver.algorithm = 'qaoa'
    result = service.allocate(scenario)
    assert result.selected_solver == 'exact'
    assert result.quantum.status == 'unavailable'
    assert result.selection_reason.startswith('Classical fallback:')


@pytest.mark.parametrize('field,value', [('reps', 4), ('shots', 9000), ('maxiter', 101), ('seed', -1)])
def test_solver_budget_is_bounded(field, value):
    from pydantic import ValidationError
    from backend.allocation.scenario import AllocationRequest
    scenario = demo_scenario().model_dump()
    scenario['solver'][field] = value
    with pytest.raises(ValidationError):
        AllocationRequest.model_validate(scenario)


def test_five_fixed_hospital_preset_and_manual_locations_roundtrip():
    with TestClient(app) as client:
        response = client.get('/api/allocation/demo?hospital_count=5')
        assert response.status_code == 200
        scenario = response.json()
        assert len(scenario['hospitals']) == 5
        fixed_hospitals = scenario['hospitals'].copy()
        scenario['ambulances'][0].update(latitude=9.966, longitude=76.285)
        scenario['incidents'][0].update(latitude=9.979, longitude=76.310)
        result = client.post('/api/allocation/optimize', json=scenario)
        assert result.status_code == 200
        assert len(result.json()['assignments']) == 3
        assert result.json()['qubit_count'] <= 12
        a1 = next(c for c in result.json()['variables'] if c['ambulance_id'] == 'A1')
        assert a1['legs'][0]['coordinates'][0] == [76.285, 9.966]
        assert client.get('/api/allocation/demo?hospital_count=5').json()['hospitals'] == fixed_hospitals


def test_invalid_hospital_preset_and_bad_manual_coordinates_are_rejected():
    with TestClient(app) as client:
        assert client.get('/api/allocation/demo?hospital_count=4').status_code == 422
        scenario = demo_scenario().model_dump()
        scenario['incidents'][0]['latitude'] = 91
        assert client.post('/api/allocation/optimize', json=scenario).status_code == 422

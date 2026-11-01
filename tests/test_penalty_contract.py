"""Independent verification of penalty algebra, not a QAOA-quality claim."""
from itertools import combinations, product

import pytest

from backend.allocation.qubo import build_problem, exact_plan, valid_bits
from backend.allocation.scenario import demo_scenario


@pytest.mark.parametrize('mode', ['normal', 'scarce', 'unavailable'])
def test_every_bitstring_matches_constraint_penalties_and_invalid_plans_lose(mode):
    scenario = demo_scenario()
    if mode == 'scarce':
        scenario.ambulances[1].available = False
        scenario.hospitals[0].available_slots = 0
    elif mode == 'unavailable':
        for ambulance in scenario.ambulances:
            ambulance.available = False
    problem = build_problem(scenario)
    served_upper_bound = sum(max((c.cost for c in group if c.ambulance_id is not None), default=0)
                             for group in problem.full_groups)
    for incident, group in zip(scenario.incidents, problem.full_groups):
        assert group[-1].cost / incident.severity > served_upper_bound
    all_unserved = sum(group[-1].cost for group in problem.groups)
    assert problem.penalty > sum(max(c.cost for c in group) for group in problem.groups)
    best_valid = float('inf')
    for bits in product((0, 1), repeat=len(problem.choices)):
        selected = [choice for choice, bit in zip(problem.choices, bits) if bit]
        one_hot = sum((sum(c.incident_id == incident.id for c in selected) - 1)**2
                      for incident in scenario.incidents)
        resource_conflicts = sum(a.incident_id != b.incident_id
                                 and a.ambulance_id is not None and b.ambulance_id is not None
                                 and (a.ambulance_id == b.ambulance_id or a.hospital_id == b.hospital_id)
                                 for a, b in combinations(selected, 2))
        expected = sum(c.cost for c in selected) + problem.penalty * (one_hot + resource_conflicts)
        assert problem.energy(bits) == pytest.approx(expected, abs=1e-7)
        if valid_bits(problem, bits):
            best_valid = min(best_valid, expected)
        else:
            assert problem.energy(bits) > all_unserved
    assert best_valid == pytest.approx(sum(c.cost for c in exact_plan(problem.groups)))

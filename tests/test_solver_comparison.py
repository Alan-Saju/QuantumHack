import pytest

from backend.allocation import service
from backend.allocation.qaoa import QuantumResult
from backend.allocation.qubo import build_problem
from backend.allocation.scenario import demo_scenario


def test_worse_valid_qaoa_plan_is_preserved_for_comparison(monkeypatch):
    scenario = demo_scenario()
    scenario.solver.algorithm = 'qaoa'
    problem = build_problem(scenario)
    unserved = [group[-1] for group in problem.groups]
    calls = []
    def sample(*args):
        calls.append(1)
        return QuantumResult(status='completed', assignments=unserved, objective=sum(c.cost for c in unserved))
    monkeypatch.setattr(service, 'solve_qaoa', sample)
    result = service.allocate(scenario)
    assert calls == [1]
    assert result.selected_solver == 'exact'
    assert result.quantum.plan_valid is True
    assert result.quantum.assignments == unserved
    assert result.quantum.objective > result.exact_objective
    assert result.exact_assignments == result.assignments


@pytest.mark.parametrize('status,assignments', [('unavailable', None), ('completed', []), ('completed', None)])
def test_unavailable_or_invalid_quantum_plan_cannot_be_displayed(monkeypatch, status, assignments):
    scenario = demo_scenario()
    scenario.solver.algorithm = 'qaoa'
    monkeypatch.setattr(service, 'solve_qaoa', lambda *args: QuantumResult(status=status, assignments=assignments))
    result = service.allocate(scenario)
    assert result.quantum.plan_valid is False
    assert result.selected_solver == 'exact'


def test_independent_validation_rejects_a_claimed_valid_conflicting_plan(monkeypatch):
    scenario = demo_scenario()
    scenario.solver.algorithm = 'qaoa'
    problem = build_problem(scenario)
    conflicting = [problem.groups[0][0]] * len(scenario.incidents)
    monkeypatch.setattr(service, 'solve_qaoa', lambda *args: QuantumResult(
        status='completed', plan_valid=True, assignments=conflicting, objective=0))
    result = service.allocate(scenario)
    assert result.quantum.plan_valid is False
    assert result.selected_solver == 'exact'

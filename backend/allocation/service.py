from time import perf_counter
from typing import Literal

from pydantic import Field

from backend.models.route import Model
from backend.allocation.qubo import Choice, build_problem, compatible, exact_plan
from backend.allocation.qaoa import QuantumResult, solve_qaoa


class QuboTerm(Model):
    i: int
    j: int
    value: float


class AllocationResult(Model):
    travel_source: Literal['synthetic', 'osrm']
    status: Literal['complete', 'partial']
    selected_solver: Literal['exact', 'qaoa']
    selection_reason: str
    assignments: list[Choice]
    unserved: list[str]
    objective: float
    exact_objective: float
    reduced_exact_objective: float
    exact_assignments: list[Choice]
    exact_runtime_ms: float
    quantum: QuantumResult
    qaoa_gap_percent: float | None
    variables: list[Choice]
    full_choice_count: int
    qubit_count: int
    qubo: list[QuboTerm]
    offset: float
    penalty: float
    warnings: list[str] = Field(default_factory=list)


def allocate(scenario, client=None):
    def osrm_leg(start, end):
        routes = client.routes(start, end)
        if not routes:
            return None
        route = min(routes, key=lambda r: r.duration_s)
        return route.duration_s / 60, route.geometry

    problem = build_problem(scenario, osrm_leg if scenario.travel_source == 'osrm' else None)
    start = perf_counter()
    exact = list(exact_plan(problem.full_groups))
    reduced = list(exact_plan(problem.groups))
    runtime = (perf_counter() - start) * 1000
    optimum = sum(c.cost for c in exact)
    quantum = (solve_qaoa(problem, scenario.solver) if scenario.solver.algorithm == 'qaoa'
               else QuantumResult(status='not_requested'))
    selected, selected_solver = exact, 'exact'
    reason = 'Exact full-scenario optimum.'
    if scenario.solver.algorithm == 'qaoa':
        candidate = quantum.assignments
        # Validate again at the service boundary. Samples must cover every incident
        # exactly once, including explicit unserved choices, without resource reuse.
        valid = (candidate is not None and len(candidate) == len(scenario.incidents)
                 and {c.incident_id for c in candidate} == {i.id for i in scenario.incidents}
                 and all(c in problem.choices for c in candidate) and compatible(candidate))
        if valid and sum(c.cost for c in candidate) <= optimum + 1e-8:
            selected, selected_solver = candidate, 'qaoa'
            reason = 'Validated QAOA sample matches the full exact optimum within numerical tolerance.'
        else:
            reason = ('Classical fallback: ' + (quantum.message if quantum.status != 'completed'
                      else 'no feasible QAOA sample.' if not valid else 'QAOA sample is worse than the full exact optimum.'))
    unserved = [c.incident_id for c in selected if c.ambulance_id is None]
    return AllocationResult(
        travel_source=scenario.travel_source, status='partial' if unserved else 'complete',
        selected_solver=selected_solver, selection_reason=reason, assignments=selected, unserved=unserved,
        objective=sum(c.cost for c in selected), exact_objective=optimum,
        reduced_exact_objective=sum(c.cost for c in reduced), exact_assignments=exact, exact_runtime_ms=runtime,
        quantum=quantum, qaoa_gap_percent=((quantum.objective - optimum) / max(abs(optimum), 1e-9) * 100
                                          if quantum.objective is not None else None),
        variables=problem.choices, full_choice_count=sum(map(len, problem.full_groups)),
        qubit_count=len(problem.choices), qubo=[QuboTerm(i=i, j=j, value=v) for (i, j), v in problem.q.items()],
        offset=problem.offset, penalty=problem.penalty,
        warnings=['Synthetic scenario resources and severity policy; research demonstration only.',
                  'QAOA searches at most three served choices plus unserved per incident. Shortlisting can exclude the full optimum.',
                  'Each hospital represents one receiving slot; no multi-round scheduling.',
                  ('Straight connectors and 30 km/h geometric estimates, not road routes.' if scenario.travel_source == 'synthetic'
                   else 'OSRM road travel times; allocation does not certify emergency road suitability.')])

// Derive either solver's view from a single immutable API result; no requests.
export function comparisonMessage(result) {
  const quantum = allocationView(result, 'qaoa');
  if (!quantum) return `QAOA view unavailable: ${result.quantum.message || 'no validated quantum plan was returned'}. Classical remains available.`;
  const signature = choices => choices.map(c => `${c.incident_id}:${c.ambulance_id}:${c.hospital_id}`).sort().join('|');
  const same = signature(result.exact_assignments) === signature(quantum.assignments);
  return same
    ? 'Both solvers returned identical assignments; the same routes and cost are expected. Solver runtime and details change with the view.'
    : 'The solvers returned different assignments. Routes, costs, served incidents and trip details follow the selected solver.';
}

export function allocationView(result, solver) {
  const isQuantum = solver === 'qaoa';
  if (solver !== 'exact' && !isQuantum) return null;
  if (isQuantum && (result.quantum.status !== 'completed' || !result.quantum.plan_valid
    || !Array.isArray(result.quantum.assignments))) return null;
  const assignments = isQuantum ? result.quantum.assignments : result.exact_assignments;
  const objective = assignments.reduce((sum, choice) => sum + choice.cost, 0);
  const unserved = assignments.filter(choice => choice.ambulance_id === null).map(choice => choice.incident_id);
  const comparison = objective > result.exact_objective + 1e-8
    ? 'Classical has lower cost in this run.' : 'Matches the Classical optimum.';
  return { ...result, assignments, objective, unserved, selected_solver: solver,
    qaoa_gap_percent: isQuantum ? (objective - result.exact_objective) / Math.max(Math.abs(result.exact_objective), 1e-9) * 100 : 0,
    status: unserved.length ? 'partial' : 'complete',
    selection_reason: isQuantum
      ? `Viewing the QAOA sampled plan from this run. ${comparison}`
      : 'Viewing the Classical plan from this run. Full-scenario optimum.' };
}

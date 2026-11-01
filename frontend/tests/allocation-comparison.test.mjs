import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocationView, comparisonMessage } from '../src/allocation-comparison.js';

const classical = [{ incident_id: 'I1', ambulance_id: 'A1', hospital_id: 'H1', cost: 10, legs: ['classical-road'] }];
const sampled = [{ incident_id: 'I1', ambulance_id: null, hospital_id: null, cost: 30, legs: [] }];
const run = { selected_solver: 'exact', assignments: classical, exact_assignments: classical, exact_objective: 10,
  quantum: { status: 'completed', plan_valid: true, assignments: sampled, objective: 30 } };

test('switches to the raw valid QAOA plan even when Classical is better', () => {
  const before = structuredClone(run);
  const qaoa = allocationView(run, 'qaoa');
  assert.deepEqual(qaoa.assignments, sampled);
  assert.deepEqual(qaoa.unserved, ['I1']);
  assert.equal(qaoa.objective, 30);
  assert.equal(qaoa.selected_solver, 'qaoa');
  assert.equal(qaoa.status, 'partial');
  assert.equal(qaoa.qaoa_gap_percent, 200);
  assert.match(qaoa.selection_reason, /Classical has lower cost/);
  const exact = allocationView(run, 'exact');
  assert.deepEqual(exact.assignments, classical);
  assert.deepEqual(exact.unserved, []);
  assert.equal(exact.objective, 10);
  assert.equal(exact.status, 'complete');
  assert.deepEqual(run, before);
});

test('never substitutes a classical plan for an unavailable or invalid QAOA result', () => {
  for (const quantum of [{ status: 'unavailable' }, { status: 'completed', plan_valid: false, assignments: sampled },
    { status: 'completed', plan_valid: true, assignments: null }]) {
    const result = { ...run, quantum };
    assert.equal(allocationView(result, 'qaoa'), null);
    assert.deepEqual(allocationView(result, 'exact').assignments, classical);
  }
});

test('explains identical plans without inventing different costs or routes', () => {
  const same = { ...run, quantum: { ...run.quantum, assignments: classical, objective: 10 } };
  assert.match(comparisonMessage(same), /identical assignments/);
  assert.deepEqual(allocationView(same, 'exact').assignments, allocationView(same, 'qaoa').assignments);
  const tie = { ...run, quantum: { ...run.quantum, assignments: [{ ...classical[0], ambulance_id: 'A2' }], objective: 10 } };
  assert.match(comparisonMessage(tie), /different assignments/);
});

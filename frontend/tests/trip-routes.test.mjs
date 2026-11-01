import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTripRequests, combineTripRoutes } from '../src/trip-routes.js';

const route = (id, seconds, feasible = true) => ({ id, estimated_time_s: seconds, distance_m: seconds * 10,
  feasible, cost: { total: seconds + 5, suitability_penalty_s: 5 }, segments: [{ id }],
  geometry: { type: 'LineString', coordinates: [[76.26, 9.93], [76.28, 9.94]] },
  warnings: [], rejection_reasons: feasible ? [] : ['Width limit'] });
const result = candidates => ({ candidates, classical_route: candidates.find(candidate => candidate.feasible) ?? null });

test('trip requests travel from ambulance to incident and from incident to hospital', () => {
  const requests = buildTripRequests([9.93, 76.26], [9.94, 76.28], [9.95, 76.29]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].emergency, requests[1].ambulance);
  assert.equal(requests[0].ambulance.latitude, 9.93);
  assert.equal(requests[1].emergency.latitude, 9.95);
  assert.throws(() => buildTripRequests([9.93, 76.26], [], [9.95, 76.29]));
});

test('suggestions include both legs and combine times, distance and costs', () => {
  const first = result([route('a', 60), route('b', 90)]);
  const second = result([route('c', 120), route('d', 150)]);
  const trip = combineTripRoutes(first, second);
  assert.equal(trip.candidates.length, 4);
  assert.equal(trip.classical_route.id, 'trip-0-0');
  assert.equal(trip.candidates[0].estimated_time_s, 180);
  assert.equal(trip.candidates[0].distance_m, 1800);
  assert.equal(trip.candidates[0].cost.total, 190);
  assert.equal(trip.candidates[0].geometry.type, 'MultiLineString');
  assert.equal(trip.candidates[0].geometry.coordinates.length, 2);
  assert.deepEqual(trip.candidates[0].legs.map(leg => leg.id), ['a', 'c']);
});

test('a rejected or absent hospital leg never becomes a suggested complete trip', () => {
  const trip = combineTripRoutes(result([route('a', 60)]), result([route('c', 120, false)]));
  assert.equal(trip.status, 'no_feasible_route');
  assert.equal(trip.classical_route, null);
  assert.equal(trip.candidates[0].feasible, false);
  assert.match(trip.candidates[0].rejection_reasons[0], /Hospital.*Width limit/);
  assert.equal(combineTripRoutes(result([route('a', 60)]), result([])).candidates.length, 0);
});

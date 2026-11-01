import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRoutes, formatArrival } from '../src/route-comparison.js';

test('compares against the fastest eligible route and preserves provider order', () => {
  const routes = [{ id: 'rejected', feasible: false, estimated_time_s: 20 },
    { id: 'recommended', feasible: true, estimated_time_s: 210 },
    { id: 'fast', feasible: true, estimated_time_s: 120 }];
  assert.deepEqual(compareRoutes(routes, 'recommended').map(r => [r.id, r.badge, r.difference]), [
    ['rejected', 'Inspect only', 'Failed road checks'],
    ['recommended', 'Recommended', '+2 min vs fastest'],
    ['fast', 'Fastest', 'Fastest available']]);
});

test('ties, short delays, and all rejected routes have honest labels', () => {
  assert.equal(compareRoutes([{ feasible: true, estimated_time_s: 100 },
    { feasible: true, estimated_time_s: 110 }])[1].difference, '+10 sec vs fastest');
  assert.equal(compareRoutes([{ feasible: true, estimated_time_s: 100 },
    { feasible: true, estimated_time_s: 100 }])[1].badge, 'Fastest');
  assert.equal(compareRoutes([{ feasible: false, estimated_time_s: 10 }])[0].badge, 'Inspect only');
  assert.deepEqual(compareRoutes([]), []);
});

test('arrival estimates use Kochi time and cross midnight correctly', () => {
  assert.equal(formatArrival(120, new Date('2026-11-01T18:29:00Z')), '00:01 IST');
});

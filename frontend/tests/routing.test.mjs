import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, formatDistance, formatDuration, routeError } from '../src/routing.js';

test('route requests enable road suitability costs without simulated traffic', () => {
  const body = buildRequest([9.9312, 76.2673], [9.95, 76.29]);
  assert.equal(body.ambulance.latitude, 9.9312);
  assert.equal(body.emergency.longitude, 76.29);
  assert.deepEqual(body.optimization, { algorithm: 'classical', consider_traffic: false,
    consider_road_width: true, consider_risk: true });
});

test('invalid or missing coordinates never generate a request', () => {
  for (const point of [[91, 76], [9, 181], [NaN, 76], [9], ['', 76], [null, 76]]) {
    assert.throws(() => buildRequest(point, [9, 76]));
  }
});

test('route metrics preserve useful units for short and long trips', () => {
  assert.equal(formatDistance(900), '900 m');
  assert.equal(formatDistance(2400), '2.4 km');
  assert.equal(formatDuration(20), '20 sec');
  assert.equal(formatDuration(90), '2 min');
});

test('service and no-route failures have actionable text', () => {
  assert.match(routeError(503), /OSRM/);
  assert.match(routeError(422), /coordinates/i);
  assert.match(routeError(500), /try again/i);
});

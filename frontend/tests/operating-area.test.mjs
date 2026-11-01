import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KERALA_BOUNDS, withinArea } from '../src/operating-area.js';

test('Kerala area includes all three supplied hospital locations and its edges', () => {
  for (const [lat, lon] of [[10.025185, 76.338884], [9.952000, 76.2990001], [10.0469447, 76.3352506], ...KERALA_BOUNDS]) {
    assert.equal(withinArea(lat, lon), true);
  }
});

test('placement accepts Kerala cities beyond Kochi', () => {
  for (const [lat, lon] of [[8.5241, 76.9366], [11.2588, 75.7804], [12.4996, 74.9869]]) {
    assert.equal(withinArea(lat, lon), true);
  }
});

test('placement rejects locations beyond Kerala and invalid coordinates', () => {
  for (const [lat, lon] of [[14, 76.3], [8, 76.3], [10, 74], [10, 78], [NaN, 76.3]]) {
    assert.equal(withinArea(lat, lon), false);
  }
});

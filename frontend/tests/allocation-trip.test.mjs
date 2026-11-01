import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAllocationSnapshot, ambulanceTrip } from '../src/allocation-trip.js';

const scenario = { ambulances: [{ id: 'A1', available: true }, { id: 'A2', available: true },
  { id: 'A3', available: false }], incidents: [{ id: 'I1', name: 'Incident' }], hospitals: [{ id: 'H1', name: 'Hospital' }] };
const result = { assignments: [{ ambulance_id: 'A1', incident_id: 'I1', hospital_id: 'H1', response_minutes: 3.4, transport_minutes: 5.7 }], travel_source: 'osrm' };

test('trip times use both assigned legs and snapshot is isolated from later edits', () => {
  const at = new Date('2026-11-01T10:00:00Z');
  const snapshot = createAllocationSnapshot(scenario, result, at);
  const trip = ambulanceTrip(snapshot, 'A1');
  assert.equal(trip.totalMinutes, 9.1);
  assert.equal(trip.status, 'Assigned');
  assert.equal(trip.incident.name, 'Incident');
  assert.equal(trip.hospital.name, 'Hospital');
  scenario.ambulances[0].available = false;
  assert.equal(ambulanceTrip(snapshot, 'A1').ambulance.available, true);
  scenario.ambulances[0].available = true;
  assert.equal(snapshot.capturedAt, '2026-11-01T10:00:00.000Z');
});

test('unassigned and unavailable ambulances never get an invented trip', () => {
  const snapshot = createAllocationSnapshot(scenario, result);
  for (const [id, status] of [['A2', 'Available / unassigned'], ['A3', 'Unavailable']]) {
    const trip = ambulanceTrip(snapshot, id);
    assert.equal(trip.status, status);
    assert.equal(trip.assignment, undefined);
    assert.equal(trip.totalMinutes, null);
    assert.equal(trip.incident, undefined);
    assert.equal(trip.hospital, undefined);
  }
  assert.equal(ambulanceTrip(snapshot, 'missing'), null);
});

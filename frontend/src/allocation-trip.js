import { node, roadLegDetails } from './allocation-presentation.js';

export function createAllocationSnapshot(scenario, result, capturedAt = new Date()) {
  return { scenario: structuredClone(scenario), result: structuredClone(result), capturedAt: capturedAt.toISOString() };
}

export function ambulanceTrip(snapshot, id) {
  const ambulance = snapshot.scenario.ambulances.find(item => item.id === id);
  if (!ambulance) return null;
  const assignment = snapshot.result.assignments.find(item => item.ambulance_id === id);
  return { ambulance, assignment,
    incident: assignment && snapshot.scenario.incidents.find(item => item.id === assignment.incident_id),
    hospital: assignment && snapshot.scenario.hospitals.find(item => item.id === assignment.hospital_id),
    totalMinutes: assignment ? assignment.response_minutes + assignment.transport_minutes : null,
    status: assignment ? 'Assigned' : ambulance.available ? 'Available / unassigned' : 'Unavailable',
  };
}

export function snapshotTime(snapshot) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(snapshot.capturedAt)) + ' IST';
}

export function vehicleDescription(vehicle, profiles) {
  const profile = profiles[vehicle.vehicle_type];
  if (['width_m', 'height_m', 'weight_t'].some(field => !Number.isFinite(vehicle[field]) || vehicle[field] <= 0)) {
    return `${profile.label} · enter positive width, height and weight values.`;
  }
  const custom = ['width_m', 'height_m', 'weight_t'].some(field => vehicle[field] !== profile[field]);
  return `${profile.label}${custom ? ' · customized demo profile' : ' · demo profile'}: ${vehicle.width_m} m wide, ${vehicle.height_m} m high, ${vehicle.weight_t} t`;
}

export function renderAmbulanceTrip(container, snapshot, id, profiles) {
  const trip = ambulanceTrip(snapshot, id);
  container.replaceChildren();
  const heading = node('h2', `${id} · ${profiles[trip.ambulance.vehicle_type].label}`, 'trip-title');
  heading.id = 'trip-title'; heading.tabIndex = -1;
  container.append(heading, node('p', trip.ambulance.name, 'trip-unit'),
    node('p', trip.status, 'trip-status'),
    node('p', `${snapshot.result.selected_solver === 'qaoa' ? 'QAOA' : 'Classical'} allocation snapshot · ${snapshotTime(snapshot)}`, 'trip-caption'),
    node('p', 'Position and journey progress are not live tracked.', 'trip-caption'));
  if (trip.assignment) {
    const total = node('div', '', 'trip-total');
    total.append(node('strong', `${trip.totalMinutes.toFixed(1)} min`), node('span', 'Estimated total driving time'));
    container.append(total);
    const journey = node('ol', '', 'trip-journey');
    for (const [resource, label, time, className] of [
      [trip.ambulance, 'Ambulance start', null, 'trip-start'],
      [trip.incident, 'To incident', trip.assignment.response_minutes, 'trip-response'],
      [trip.hospital, 'To hospital', trip.assignment.transport_minutes, 'trip-transport'],
    ]) {
      const stop = node('li', '', className);
      const top = node('div', '', 'trip-stop-heading');
      top.append(node('span', label));
      if (time !== null) top.append(node('strong', `${time.toFixed(1)} min`));
      stop.append(top, node('strong', `${resource.id} · ${resource.name}`));
      journey.append(stop);
    }
    container.append(journey, node('p', 'Travel estimates exclude on-scene care, loading and hospital handover. Road suitability scores are separate from travel time.', 'trip-caption'));
    if (trip.assignment.leg_details?.some(leg => leg.road_coverage)) container.append(roadLegDetails(trip.assignment.leg_details));
  } else {
    container.append(node('p', trip.ambulance.available
      ? 'No incident or hospital is assigned to this ambulance in this allocation.'
      : 'This ambulance was marked unavailable for this allocation.', 'trip-empty'));
  }
  container.append(node('h3', 'Vehicle used for routing'), node('p', vehicleDescription(trip.ambulance, profiles), 'trip-caption'),
    node('p', 'Dimensions are editable research assumptions, not manufacturer specifications.', 'trip-caption'),
    node('p', snapshot.result.travel_source === 'synthetic'
      ? 'Synthetic travel: straight-line estimates. Vehicle dimensions do not affect this mode.'
      : snapshot.result.traffic_source === 'simulated'
        ? 'Road routes use this vehicle’s dimensions and simulated traffic. No live traffic.'
        : 'Road routes use this vehicle’s dimensions. No live traffic.', 'trip-data-note'));
  return trip;
}

export function renderFleetSnapshot(container, snapshot, profiles, onSelect) {
  container.replaceChildren(node('p', `${snapshot.result.selected_solver === 'qaoa' ? 'QAOA' : 'Classical'} fleet snapshot · ${snapshotTime(snapshot)} · select an ambulance`, 'fleet-caption'));
  const fleet = node('div', '', 'fleet-buttons');
  for (const ambulance of snapshot.scenario.ambulances) {
    const trip = ambulanceTrip(snapshot, ambulance.id);
    const button = node('button', '', 'fleet-ambulance');
    button.type = 'button'; button.dataset.ambulanceId = ambulance.id;
    button.setAttribute('aria-label', `View ${ambulance.id} trip`);
    button.append(node('strong', `${ambulance.id} · ${profiles[ambulance.vehicle_type].label}`),
      node('span', trip.status), node('small', trip.assignment ? `${trip.totalMinutes.toFixed(1)} min driving` : 'No assigned trip'));
    button.addEventListener('click', () => onSelect(ambulance.id));
    fleet.append(button);
  }
  container.append(fleet);
}

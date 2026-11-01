import { node, metric, resourceIcon, renderShortcuts, updateOverview, roadLegDetails } from './allocation-presentation.js';
import { KERALA_BOUNDS, withinArea, constrainMap } from './operating-area.js';
import { createAllocationSnapshot, ambulanceTrip, renderAmbulanceTrip, renderFleetSnapshot, vehicleDescription } from './allocation-trip.js';
import { createHospitalPicker } from './hospital-picker.js';
import { allocationView, comparisonMessage } from './allocation-comparison.js';

const $ = s => document.querySelector(s);
const form = $('#scenario-form');
let scenario, map, resources, connectors, controller;
let revision = 0;
let loadingHospitals = false;
let placementEnabled = true;
let operatingBounds = KERALA_BOUNDS;
const allocationLayers = new Map();
let vehicleProfiles, snapshot, activeTripId, tripRoutes, dashboardView, returnFocus;
let hospitalPicker, hospitalTargetId;
let comparisonRun;

function setScenarioCollapsed(collapsed) {
  $('#scenario-panel').hidden = collapsed;
  $('#expand-scenario').hidden = !collapsed;
  document.body.classList.toggle('scenario-collapsed', collapsed);
  for (const id of ['collapse-scenario', 'expand-scenario']) $(`#${id}`).setAttribute('aria-expanded', String(!collapsed));
  (collapsed ? $('#expand-scenario') : $('#collapse-scenario')).focus();
  if (map) { map.invalidateSize({ pan: false }); fitResources(); }
}

$('#collapse-scenario').addEventListener('click', () => setScenarioCollapsed(true));
$('#expand-scenario').addEventListener('click', () => setScenarioCollapsed(false));

function fitTrip() {
  const bounds = L.featureGroup([resources, tripRoutes]).getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: false });
}

function openTrip(id) {
  if (!snapshot || !ambulanceTrip(snapshot, id)) return;
  hospitalPicker?.close();
  if (!activeTripId) {
    returnFocus = document.activeElement;
    dashboardView = { placement: placementEnabled, heading: $('.map-heading h2').textContent,
      caption: $('.map-heading p').textContent, mapLabel: $('#map').getAttribute('aria-label'), scroll: window.scrollY };
  }
  activeTripId = id;
  setPlacementMode(false);
  map.closePopup();
  map.removeLayer(connectors);
  tripRoutes?.remove();
  tripRoutes = L.featureGroup().addTo(map);
  const trip = renderAmbulanceTrip($('#trip-content'), snapshot, id, vehicleProfiles);
  trip.assignment?.legs.forEach((geometry, index) => {
    L.geoJSON(geometry, { style: { color: index === 0 ? '#006e60' : '#355a8a', weight: 6,
      opacity: 1, dashArray: index === 1 ? '9 6' : null } }).addTo(tripRoutes);
  });
  document.body.classList.add('trip-open');
  $('#ambulance-trip').hidden = false;
  $('.skip-link').href = '#back-to-dashboard';
  $('#map').setAttribute('aria-label', `Assigned journey for ${id}. Route and times are an allocation snapshot.`);
  $('.map-heading h2').textContent = `${id} journey`;
  $('.map-heading p').textContent = trip.assignment ? 'Ambulance → Incident → Hospital' : trip.status;
  $('#trip-map-legend').hidden = !trip.assignment;
  drawResources();
  map.invalidateSize({ pan: false }); fitTrip();
  $('#trip-title').focus({ preventScroll: true });
  if (window.matchMedia('(max-width: 800px)').matches) window.scrollTo({ top: 0 });
}

function closeTrip({ focus = true } = {}) {
  if (!activeTripId) return;
  const id = activeTripId;
  activeTripId = null;
  tripRoutes?.remove(); tripRoutes = null;
  document.body.classList.remove('trip-open');
  $('#ambulance-trip').hidden = true;
  $('.skip-link').href = '#scenario-form';
  $('#map').setAttribute('aria-label', dashboardView.mapLabel);
  $('#trip-content').replaceChildren();
  $('#trip-map-legend').hidden = true;
  $('.map-heading h2').textContent = dashboardView.heading;
  $('.map-heading p').textContent = dashboardView.caption;
  connectors.addTo(map);
  setPlacementMode(dashboardView.placement);
  drawResources(); map.invalidateSize({ pan: false }); fitResources();
  if (focus) {
    const target = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus
      : [...$('#fleet-snapshot').querySelectorAll('button')].find(button => button.dataset.ambulanceId === id);
    target?.focus({ preventScroll: true });
    window.scrollTo({ top: dashboardView.scroll });
  }
}

function fitResources() {
  if (resources?.getBounds().isValid()) map.fitBounds(resources.getBounds(), {
    paddingTopLeft: [48, 48], paddingBottomRight: [48, 100], maxZoom: 16, animate: false,
  });
}

function setPlacementMode(enabled) {
  placementEnabled = enabled;
  $('#placement-mode').setAttribute('aria-pressed', String(enabled));
  $('#placement-mode').textContent = enabled ? 'Placement on' : 'Explore map';
  $('.map-section').classList.toggle('placement-active', enabled);
  if (map) {
    if (enabled) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }
  setPlacementTarget($('#placement-target').value);
}
const movableResources = () => [...(scenario?.ambulances ?? []), ...(scenario?.incidents ?? [])];

function setPlacementTarget(id) {
  $('#placement-target').value = id;
  $('#placement-status').textContent = placementEnabled
    ? `Click to place ${id}. Drag markers to adjust. Hospital sites stay fixed.`
    : 'Explore the map freely. Turn placement on or choose a resource to change its location.';
  for (const marker of document.querySelectorAll('.resource-marker')) {
    marker.classList.toggle('placement-selected', marker.textContent === id);
  }
  for (const button of $('#resource-shortcuts').children) {
    button.setAttribute('aria-pressed', String(placementEnabled && button.dataset.resourceId === id));
  }
}

function moveResource(id, latitude, longitude, advance = false) {
  const resource = movableResources().find(item => item.id === id);
  if (!resource || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
  if (!withinArea(latitude, longitude, operatingBounds)) {
    for (const axis of ['latitude', 'longitude']) $(`#coord-${id}-${axis}`).value = resource[axis].toFixed(6);
    drawResources();
    status('Choose a location inside the Kerala operating area.', 'error');
    return;
  }
  // Keep map positions, displayed coordinates and the request payload identical.
  resource.latitude = Number(latitude.toFixed(6));
  resource.longitude = Number(longitude.toFixed(6));
  for (const axis of ['latitude', 'longitude']) {
    $(`#coord-${id}-${axis}`).value = resource[axis].toFixed(6);
  }
  invalidate();
  const targets = movableResources();
  const next = advance ? targets[(targets.indexOf(resource) + 1) % targets.length].id : id;
  setPlacementTarget(next);
  status(`${id} moved to ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Optimize to update the allocation.`);
}

function coordinateControls(resource) {
  const grid = node('div', '', 'coordinate-grid');
  for (const [axis, index] of [['latitude', 0], ['longitude', 1]]) {
    const label = node('label', axis === 'latitude' ? 'Latitude' : 'Longitude');
    const input = document.createElement('input');
    input.id = `coord-${resource.id}-${axis}`;
    input.type = 'number'; input.min = operatingBounds[0][index]; input.max = operatingBounds[1][index]; input.step = 'any'; input.required = true;
    input.value = resource[axis].toFixed(6);
    input.setAttribute('aria-label', `${resource.id} ${axis}`);
    input.addEventListener('input', () => invalidate());
    input.addEventListener('change', () => {
      const latitude = $(`#coord-${resource.id}-latitude`).valueAsNumber;
      const longitude = $(`#coord-${resource.id}-longitude`).valueAsNumber;
      moveResource(resource.id, latitude, longitude);
    });
    label.append(input); grid.append(label);
  }
  const pick = node('button', `Place ${resource.id} on map`, 'place-button');
  pick.type = 'button';
  pick.addEventListener('click', () => {
    setPlacementMode(true);
    setPlacementTarget(resource.id);
    $('#placement-target').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  grid.append(pick);
  return grid;
}
function status(text, state = 'ready') { $('#status').textContent = text; $('#status').dataset.state = state; }
async function json(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404 && url.startsWith('/api/allocation/')) {
      throw new Error('This running backend has no allocation endpoints. Restart the project backend, then reload this page.');
    }
    throw new Error(data.error?.message ?? `Request failed (${response.status}). Check the backend.`);
  }
  return data;
}
function busy(value) {
  $('#optimize').disabled = value || loadingHospitals;
  $('#optimize').replaceChildren(node('span', value ? 'Optimizing allocation…' : 'Optimize allocation'), node('span', value ? '…' : '↗'));
  $('.results').setAttribute('aria-busy', String(value || loadingHospitals));
  document.body.dataset.optimizing = String(value);
}
function drawResources() {
  if (!resources) return;
  resources.clearLayers();
  const trip = activeTripId && snapshot ? ambulanceTrip(snapshot, activeTripId) : null;
  for (const [items, type] of [[scenario.ambulances, 'ambulance'], [scenario.hospitals, 'hospital'], [scenario.incidents, 'incident']]) {
    for (const r of items) {
      const tripResource = trip && (type === 'ambulance' ? trip.ambulance : type === 'incident' ? trip.incident : trip.hospital);
      if (trip && tripResource?.id !== r.id) continue;
      const unavailable = r.available === false || r.available_slots === 0;
      const popup = node('div', '', 'map-popup');
      popup.append(node('strong', `${r.id} · ${r.name.replace(' (demo)', '')}`));
      popup.append(node('p', r.capabilities ? `${r.capabilities.join(', ')} · ${unavailable ? 'unavailable' : 'available'}` : `Severity ${r.severity} · ${r.requires}`));
      const movable = type !== 'hospital' && !activeTripId;
      const marker = L.marker([r.latitude, r.longitude], { draggable: movable, title: `${r.id}: ${r.name}`, alt: `${type}: ${r.id}`, icon: resourceIcon(r, type) }).bindPopup(popup).addTo(resources);
      marker.on('click', event => {
        L.DomEvent.stopPropagation(event);
        if (snapshot && type === 'ambulance' && !activeTripId) { openTrip(r.id); return; }
        if (movable) setPlacementTarget(r.id);
      });
      marker.on('keypress', event => {
        if (event.originalEvent.key === 'Enter' && snapshot && type === 'ambulance' && !activeTripId) openTrip(r.id);
      });
      if (movable) marker.on('dragend', () => {
        const position = marker.getLatLng();
        moveResource(r.id, position.lat, position.lng);
      });
    }
  }
  updateOverview(scenario);
  setPlacementTarget($('#placement-target').value);
}
function invalidate() {
  closeTrip({ focus: false });
  comparisonRun = null;
  $('#solver-switch').hidden = true;
  $('#solver-note').hidden = true;
  snapshot = null;
  $('#fleet-snapshot').hidden = true;
  $('#fleet-snapshot').replaceChildren();
  revision++; controller?.abort(); busy(false); connectors?.clearLayers();
  allocationLayers.clear();
  $('#assignments').replaceChildren(); $('#metrics').replaceChildren(); $('#model-details').hidden = true; $('#source-label').textContent = 'Scenario changed';
  $('#source-label').removeAttribute('data-solver');
  $('#result-empty').hidden = false;
  status('Scenario changed. Optimize again to calculate a current allocation.'); drawResources();
}
function renderControls() {
  for (const [key, type] of [['ambulances', 'ambulance'], ['hospitals', 'hospital'], ['incidents', 'incident']]) {
    const container = $(`#${key}`); container.replaceChildren();
    for (const r of scenario[key]) {
      const row = node('div', '', 'resource'), label = node('label', '');
      row.dataset.type = type;
      label.htmlFor = `control-${r.id}`;
      const heading = node('strong', '');
      heading.append(node('span', r.id, 'resource-id'), node('span', r.name.replace(' (demo)', ''), 'resource-name'));
      label.append(heading);
      let control;
      if (type === 'incident') {
        control = document.createElement('select');
        for (const level of [1,2,3]) { const option = node('option', `Level ${level}`); option.value = level; control.append(option); }
        control.value = r.severity;
        control.addEventListener('change', () => { r.severity = Number(control.value); invalidate(); });
      } else {
        control = document.createElement('input'); control.type = 'checkbox'; control.checked = type === 'ambulance' ? r.available : r.available_slots === 1;
        control.addEventListener('change', () => {
          if (type === 'ambulance') r.available = control.checked;
          else {
            r.available_slots = Number(control.checked);
            $('#hospital-selection').textContent = `${r.id}: ${r.name}. Receiving slot ${control.checked ? 'enabled (configured)' : 'off'}.`;
          }
          invalidate();
        });
      }
      control.id = `control-${r.id}`; control.setAttribute('aria-label', type === 'incident' ? `${r.id} severity` : `${r.id} available`);
      label.append(control); row.append(label, node('small', type === 'incident' ? `Requires ${r.requires}` : `${r.capabilities.join(' / ')} · ${type === 'hospital' ? 'one receiving slot' : 'one dispatch per round'}`));
      if (type === 'incident') {
        const care = node('label', 'Required capability');
        const select = document.createElement('select');
        select.id = `requires-${r.id}`;
        select.setAttribute('aria-label', `${r.id} required capability`);
        for (const capability of ['general', 'cardiac', 'trauma']) {
          const option = node('option', capability); option.value = capability; select.append(option);
        }
        select.value = r.requires;
        select.addEventListener('change', () => { r.requires = select.value; invalidate(); });
        care.append(select); row.append(care);
      }
      if (type === 'hospital') {
        const care = node('fieldset', '', 'hospital-care');
        care.append(node('legend', 'Configured care capabilities'));
        for (const capability of ['general', 'cardiac', 'trauma']) {
          const label = node('label', capability), checkbox = document.createElement('input');
          checkbox.type = 'checkbox'; checkbox.checked = r.capabilities.includes(capability);
          checkbox.id = `hospital-care-${r.id}-${capability}`;
          checkbox.setAttribute('aria-label', `${r.id} ${capability} care`);
          checkbox.addEventListener('change', () => {
            const values = checkbox.checked ? [...r.capabilities, capability] : r.capabilities.filter(value => value !== capability);
            if (!values.length) { checkbox.checked = true; status('Keep at least one configured hospital capability.', 'error'); return; }
            r.capabilities = values;
            row.querySelector('small').textContent = `${r.capabilities.join(' / ')} · one receiving slot`;
            invalidate();
          });
          label.prepend(checkbox); care.append(label);
        }
        row.append(care);
      }
      if (type === 'ambulance') {
        r.vehicle_type ??= 'traveller';
        const vehicleLabel = node('label', 'Ambulance type');
        const vehicleSelect = document.createElement('select');
        vehicleSelect.id = `vehicle-${r.id}-type`;
        vehicleSelect.setAttribute('aria-label', `${r.id} ambulance type`);
        for (const [value, profile] of Object.entries(vehicleProfiles)) {
          const option = node('option', profile.label); option.value = value; vehicleSelect.append(option);
        }
        vehicleSelect.value = r.vehicle_type;
        const profileSummary = node('small', vehicleDescription(r, vehicleProfiles), 'vehicle-profile-summary');
        profileSummary.id = `vehicle-${r.id}-summary`;
        vehicleSelect.addEventListener('change', () => {
          r.vehicle_type = vehicleSelect.value;
          for (const field of ['width_m', 'height_m', 'weight_t']) {
            r[field] = vehicleProfiles[r.vehicle_type][field];
            $(`#vehicle-${r.id}-${field}`).value = r[field];
          }
          profileSummary.textContent = vehicleDescription(r, vehicleProfiles);
          invalidate();
        });
        vehicleLabel.append(vehicleSelect); row.append(vehicleLabel, profileSummary);
        const dimensions = node('details', '', 'vehicle-dimensions');
        dimensions.append(node('summary', 'Vehicle dimensions'));
        const grid = node('div', '', 'controls-grid');
        for (const [field, title] of [['width_m', 'Width (m)'], ['height_m', 'Height (m)'], ['weight_t', 'Weight (t)']]) {
          const label = node('label', title), input = document.createElement('input');
          input.type = 'number'; input.min = '0.1'; input.step = 'any'; input.required = true;
          input.id = `vehicle-${r.id}-${field}`; input.value = r[field];
          input.setAttribute('aria-label', `${r.id} ${title}`);
          input.addEventListener('input', () => {
            r[field] = input.valueAsNumber;
            profileSummary.textContent = vehicleDescription(r, vehicleProfiles);
            invalidate();
          });
          label.append(input); grid.append(label);
        }
        dimensions.append(node('p', 'Editable demo dimensions; not manufacturer specifications.', 'control-note'), grid); row.append(dimensions);
      }
      if (type !== 'hospital') row.append(coordinateControls(r));
      else row.append(node('small', `Hospital site: ${r.latitude}, ${r.longitude}`));
      container.append(row);
    }
  }
  renderShortcuts(scenario, id => { setPlacementMode(true); setPlacementTarget(id); });
  const slot = $('#hospital-slot'), selectedSlot = slot.value;
  slot.replaceChildren();
  for (const hospital of scenario.hospitals) {
    const option = node('option', `${hospital.id} · ${hospital.name}`); option.value = hospital.id; slot.append(option);
  }
  if (scenario.hospitals.some(h => h.id === selectedSlot)) slot.value = selectedSlot;
}

function updateRoadControls() {
  const roadMode = $('#travel-source').value === 'osrm';
  $('#vehicle-mode-note').textContent = roadMode
    ? 'Ambulance dimensions apply to both road legs. Missing road attributes remain uncertain.'
    : 'Choose Local OSRM road routes to apply vehicle dimensions. Synthetic travel ignores them.';
  $('#require-known-width').disabled = !roadMode;
  $('#consider-traffic').disabled = !roadMode;
  $('#road-mode-note').textContent = roadMode
    ? 'ETA and suitability cost are shown separately. Missing data remains uncertain; simulated traffic is optional.'
    : 'Synthetic mode uses geometric estimates and does not apply road checks.';
}

function inspectAssignment(incidentId) {
  const layers = allocationLayers.get(incidentId);
  if (!layers?.length) return;
  const bounds = L.featureGroup(layers).getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: false });
  for (const [id, group] of allocationLayers) {
    group.forEach(layer => layer.setStyle({ opacity: id === incidentId ? 1 : 0.25, weight: id === incidentId ? 5 : 3 }));
  }
  for (const row of $('#assignments').children) row.classList.toggle('selected', row.dataset.incidentId === incidentId);
}
function show(result) {
  comparisonRun = createAllocationSnapshot(scenario, result);
  $('#solver-switch').hidden = false;
  const qaoaAvailable = allocationView(result, 'qaoa') !== null;
  $('#view-qaoa').disabled = !qaoaAvailable;
  $('#solver-note').hidden = false;
  $('#solver-note').textContent = comparisonMessage(result);
  showSolver(qaoaAvailable ? result.selected_solver : 'exact');
}

function showSolver(solver) {
  if (!comparisonRun) return;
  const result = allocationView(comparisonRun.result, solver);
  if (!result) return;
  const tripId = activeTripId;
  closeTrip({ focus: false });
  connectors.clearLayers(); allocationLayers.clear();
  $('#assignments').replaceChildren();
  snapshot = { ...comparisonRun, result };
  const label = solver === 'qaoa' ? 'QAOA' : 'Classical';
  $('#view-classical').setAttribute('aria-pressed', String(solver === 'exact'));
  $('#view-qaoa').setAttribute('aria-pressed', String(solver === 'qaoa'));
  renderFleetSnapshot($('#fleet-snapshot'), snapshot, vehicleProfiles, openTrip);
  $('#fleet-snapshot').hidden = false;
  $('#source-label').textContent = `${result.travel_source.toUpperCase()} · ${label}`;
  $('#source-label').dataset.solver = result.selected_solver;
  $('#result-empty').hidden = true;
  $('#allocation-panel').open = true;
  status(result.selection_reason, result.unserved.length ? 'error' : 'ready');
  $('#map-note').textContent = `${label} · ${result.travel_source === 'synthetic' ? 'Synthetic travel · straight-line estimates' : `OSRM road costs · ${result.traffic_source === 'simulated' ? 'simulated traffic' : 'no live traffic'}`}`;
  $('#metrics').replaceChildren(
    metric(`${result.assignments.length - result.unserved.length}/${snapshot.scenario.incidents.length}`, 'Incidents served'),
    metric(result.objective.toFixed(2), `${label} cost · min-eq`),
    metric(`${(solver === 'qaoa' ? result.quantum.runtime_ms : result.exact_runtime_ms).toFixed(0)} ms`, `${label} runtime`),
    metric(solver === 'qaoa' ? String(result.qubit_count) : '—', 'Qubits used'),
    metric(solver === 'qaoa' && result.qaoa_gap_percent !== null ? `${result.qaoa_gap_percent.toFixed(1)}%` : '0.0%', 'Cost gap vs Classical'));
  const colors = ['#006e60', '#355a8a', '#a94c19'];
  result.assignments.forEach((c, index) => {
    const row = node('div', '', `assignment${c.ambulance_id ? '' : ' unserved'}`), description = node('div', '');
    row.dataset.incidentId = c.incident_id;
    description.append(node('strong', c.ambulance_id ? `${c.ambulance_id} → ${c.incident_id} → ${c.hospital_id}` : `${c.incident_id} · unserved`));
    description.append(node('small', c.ambulance_id ? `Response ${c.response_minutes.toFixed(1)} min · transport ${c.transport_minutes.toFixed(1)} min`
      : solver === 'qaoa' ? 'The QAOA sample leaves this incident unserved.' : 'No resource assigned under the current capability, availability, road and shared-slot constraints.'));
    if (c.leg_details?.some(leg => leg.road_coverage)) description.append(roadLegDetails(c.leg_details));
    row.append(description, node('span', `Cost ${c.cost.toFixed(2)} min-eq`)); $('#assignments').append(row);
    const layers = c.legs.map((geometry, leg) => L.geoJSON(geometry, { style: { color: colors[index % colors.length], weight: 4, opacity: 0.9, dashArray: result.travel_source === 'synthetic' || leg === 1 ? '7 5' : null } }).addTo(connectors));
    allocationLayers.set(c.incident_id, layers);
    if (c.ambulance_id) {
      const inspect = node('button', 'Show on map', 'inspect-assignment');
      inspect.type = 'button'; inspect.setAttribute('aria-label', `Show ${c.incident_id} allocation on map`);
      inspect.addEventListener('click', () => inspectAssignment(c.incident_id));
      row.append(inspect);
      const tripButton = node('button', `View ${c.ambulance_id} trip`, 'inspect-assignment');
      tripButton.type = 'button';
      tripButton.addEventListener('click', () => openTrip(c.ambulance_id));
      row.append(tripButton);
    }
  });
  $('#model-details').hidden = false;
  $('#model-details > summary').textContent = `${label} solver details`;
  const quantumDetails = solver === 'qaoa'
    ? `${result.qubit_count} retained variables from ${result.full_choice_count} full choices. Feasible probability: ${(result.quantum.feasible_probability * 100).toFixed(1)}%. ${result.quantum.evaluations} evaluations. ${result.quantum.message}`
    : `Full exact search over ${result.full_choice_count} choices. ${result.exact_runtime_ms.toFixed(0)} ms. No quantum circuit used for this plan.`;
  $('#model-summary').textContent = `Viewing ${label}. ${quantumDetails} Classical cost: ${result.exact_objective.toFixed(2)}; QAOA sampled cost: ${result.quantum.objective?.toFixed(2) ?? 'unavailable'} min-eq. ${result.warnings.join(' ')}`;
  $('#model-data').textContent = JSON.stringify({ displayed_solver: solver, objective: result.objective, assignments: result.assignments,
    ...(solver === 'qaoa' ? { variable_order: result.variables.map((c, bit) => ({ bit, incident: c.incident_id, ambulance: c.ambulance_id, hospital: c.hospital_id })), offset: result.offset, penalty: result.penalty, qubo_upper_triangle: result.qubo, quantum: result.quantum }
      : { exact_objective: result.exact_objective, runtime_ms: result.exact_runtime_ms }) }, null, 2);
  drawResources();
  if (tripId) openTrip(tripId);
}
$('#view-classical').addEventListener('click', event => { event.stopPropagation(); showSolver('exact'); });
$('#view-qaoa').addEventListener('click', event => { event.stopPropagation(); showSolver('qaoa'); });
$('#back-to-dashboard').addEventListener('click', () => closeTrip());
$('#choose-hospital').addEventListener('click', () => {
  hospitalTargetId = $('#hospital-slot').value;
  if (hospitalPicker) hospitalPicker.open(`Choose hospital for ${hospitalTargetId}`);
});
$('#hospital-slot').addEventListener('change', () => hospitalPicker?.close());
form.addEventListener('input', event => { if (!/^(control-|coord-|requires-|vehicle-|hospital-count|hospital-slot|hospital-care-)/.test(event.target.id)) invalidate(); });
$('#travel-source').addEventListener('change', updateRoadControls);
form.addEventListener('invalid', event => {
  // Reveal invalid inputs before the browser tries to focus them.
  for (let parent = event.target.parentElement; parent && parent !== form; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
}, true);

$('#placement-target').addEventListener('change', () => { setPlacementMode(true); setPlacementTarget($('#placement-target').value); });
$('#placement-mode').addEventListener('click', () => setPlacementMode(!placementEnabled));
$('#fit-resources').addEventListener('click', () => {
  fitResources();
  for (const group of allocationLayers.values()) group.forEach(layer => layer.setStyle({ opacity: 0.9, weight: 4 }));
  for (const row of $('#assignments').children) row.classList.remove('selected');
});
$('#hospital-count').addEventListener('change', async () => {
  hospitalPicker?.close();
  const count = $('#hospital-count').value;
  invalidate(); loadingHospitals = true;
  busy(false); $('#hospital-count').disabled = true; $('#reset-demo').disabled = true;
  try {
    const preset = await json(`/api/allocation/demo?hospital_count=${count}`);
    scenario.hospitals = preset.hospitals;
    renderControls(); drawResources();
    fitResources();
    status(`${count} fixed hospital sites loaded. Ambulance and incident locations are preserved.`);
  } catch (error) {
    $('#hospital-count').value = String(scenario.hospitals.length);
    status(error.message, 'error');
  } finally { loadingHospitals = false; $('#hospital-count').disabled = false; $('#reset-demo').disabled = false; busy(false); }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!scenario || !form.reportValidity()) return;
  invalidate(); const current = revision;
  scenario.travel_source = $('#travel-source').value; scenario.transport_weight = Number($('#transport-weight').value);
  scenario.require_known_width = scenario.travel_source === 'osrm' && $('#require-known-width').checked;
  scenario.consider_traffic = scenario.travel_source === 'osrm' && $('#consider-traffic').checked;
  scenario.solver = { algorithm: 'qaoa', reps: Number($('#reps').value), maxiter: Number($('#maxiter').value), shots: Number($('#shots').value), seed: Number($('#seed').value) };
  const request = new AbortController(); controller = request;
  const timeout = setTimeout(() => request.abort(), 120000);
  busy(true); status('Running QAOA and Classical once for this scenario…');
  try { const result = await json('/api/allocation/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scenario), signal: request.signal }); if (current === revision) show(result); }
  catch (error) { if (current === revision) status(error.name === 'AbortError' ? 'Optimization timed out. Reduce evaluations or check local OSRM.' : error.message, 'error'); }
  finally { clearTimeout(timeout); if (current === revision) busy(false); }
});
$('#reset-demo').addEventListener('click', async () => {
  hospitalPicker?.close(); $('#hospital-selection').textContent = 'Default sites are loaded. You can replace each hospital from the map.';
  invalidate(); const current = revision; $('#reset-demo').disabled = true; $('#optimize').disabled = true;
  try { const fresh = await json(`/api/allocation/demo?hospital_count=${$('#hospital-count').value}`); if (current !== revision) return; scenario = fresh; form.reset(); updateRoadControls(); $('#hospital-count').value = String(fresh.hospitals.length); renderControls(); drawResources(); fitResources(); status('Demo reset. All three ambulances and hospital slots are available.'); }
  catch (error) { status(error.message, 'error'); }
  finally { $('#reset-demo').disabled = false; $('#optimize').disabled = false; }
});
try {
  const [initial, config, profiles] = await Promise.all([json('/api/allocation/demo'), json('/api/map-config'), json('/api/allocation/vehicle-profiles')]);
  vehicleProfiles = profiles;
  operatingBounds = config.operating_bounds ?? KERALA_BOUNDS;
  scenario = initial; renderControls(); updateRoadControls(); map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView([9.98, 76.30], 13);
  hospitalPicker = createHospitalPicker(map, place => {
    const hospital = scenario.hospitals.find(item => item.id === hospitalTargetId);
    if (scenario.hospitals.some(item => item !== hospital && item.latitude === place.latitude && item.longitude === place.longitude)) {
      status('That hospital already occupies another slot. Choose a different hospital.', 'error');
      return;
    }
    hospital.name = place.name; hospital.latitude = place.latitude; hospital.longitude = place.longitude;
    hospital.capabilities = ['general']; hospital.available_slots = 0;
    invalidate(); renderControls();
    status(`${hospital.id} set to ${place.name}. Confirm its care capabilities and receiving slot, then optimize.`);
    $('#hospital-selection').textContent = `${hospital.id}: ${place.name}. Receiving slot is off until confirmed.`;
    $('#choose-hospital').focus({ preventScroll: true });
  });
  const area = constrainMap(map, operatingBounds);
  L.DomEvent.disableClickPropagation($('#solver-switch'));
  L.DomEvent.disableScrollPropagation($('#solver-switch'));
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('click', event => { if (placementEnabled && !activeTripId) moveResource($('#placement-target').value, event.latlng.lat, event.latlng.lng, true); });
  setPlacementMode(true);
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
  const attribution = node('span', config.tile_attribution);
  const tiles = L.tileLayer(config.tile_url, { maxZoom: 19, bounds: area, attribution: attribution.innerHTML }).addTo(map);
  let failedTiles = 0;
  tiles.on('loading', () => { failedTiles = 0; });
  tiles.on('tileerror', () => { failedTiles++; $('#tile-status').hidden = false; $('#tile-status').textContent = 'Basemap tiles unavailable. Check your connection; resource placement still works.'; });
  tiles.on('load', () => { if (failedTiles === 0) $('#tile-status').hidden = true; });
  resources = L.featureGroup().addTo(map); connectors = L.featureGroup().addTo(map); drawResources();
  fitResources();
  new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    if (activeTripId) fitTrip(); else fitResources();
  }).observe($('#map'));
  $('#optimize').disabled = false; $('#reset-demo').disabled = false;
  status(`${scenario.ambulances.length} ambulances, ${scenario.incidents.length} incidents and ${scenario.hospitals.length} hospital sites. Configure availability, then optimize.`);
} catch (error) { status(`Allocation workspace could not start: ${error.message}`, 'error'); }

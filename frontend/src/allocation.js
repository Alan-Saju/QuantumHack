import { node, metric, resourceIcon, renderShortcuts, updateOverview } from './allocation-presentation.js';

const $ = s => document.querySelector(s);
const form = $('#scenario-form');
let scenario, map, resources, connectors, controller;
let revision = 0;
let loadingHospitals = false;
let placementEnabled = true;
const allocationLayers = new Map();

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
  for (const [axis, limit] of [['latitude', 90], ['longitude', 180]]) {
    const label = node('label', axis === 'latitude' ? 'Latitude' : 'Longitude');
    const input = document.createElement('input');
    input.id = `coord-${resource.id}-${axis}`;
    input.type = 'number'; input.min = -limit; input.max = limit; input.step = 'any'; input.required = true;
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
  for (const [items, type] of [[scenario.ambulances, 'ambulance'], [scenario.hospitals, 'hospital'], [scenario.incidents, 'incident']]) {
    for (const r of items) {
      const unavailable = r.available === false || r.available_slots === 0;
      const popup = node('div', '', 'map-popup');
      popup.append(node('strong', `${r.id} · ${r.name.replace(' (demo)', '')}`));
      popup.append(node('p', r.capabilities ? `${r.capabilities.join(', ')} · ${unavailable ? 'unavailable' : 'available'}` : `Severity ${r.severity} · ${r.requires}`));
      const movable = type !== 'hospital';
      const marker = L.marker([r.latitude, r.longitude], { draggable: movable, title: `${r.id}: ${r.name}`, alt: `${type}: ${r.id}`, icon: resourceIcon(r, type) }).bindPopup(popup).addTo(resources);
      marker.on('click', event => {
        L.DomEvent.stopPropagation(event);
        if (movable) setPlacementTarget(r.id);
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
        control.addEventListener('change', () => { if (type === 'ambulance') r.available = control.checked; else r.available_slots = Number(control.checked); invalidate(); });
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
      if (type !== 'hospital') row.append(coordinateControls(r));
      else row.append(node('small', `Fixed site: ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`));
      container.append(row);
    }
  }
  renderShortcuts(scenario, id => { setPlacementMode(true); setPlacementTarget(id); });
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
  $('#source-label').textContent = `${result.travel_source.toUpperCase()} · ${result.selected_solver.toUpperCase()}`;
  $('#source-label').dataset.solver = result.selected_solver;
  $('#result-empty').hidden = true;
  $('#allocation-panel').open = true;
  status(result.selection_reason, result.unserved.length ? 'error' : 'ready');
  $('#map-note').textContent = result.travel_source === 'synthetic' ? 'Synthetic travel · straight-line estimates' : 'OSRM road routes · no live traffic';
  $('#metrics').replaceChildren(metric(`${result.assignments.length - result.unserved.length}/${scenario.incidents.length}`, 'Incidents served'), metric(result.exact_objective.toFixed(2), 'Full exact objective'), metric(result.quantum.objective?.toFixed(2) ?? '—', 'QAOA sampled objective'), metric(String(result.qubit_count), 'Qubits in retained model'), metric(result.qaoa_gap_percent === null ? '—' : `${result.qaoa_gap_percent.toFixed(1)}%`, 'QAOA gap vs full exact'));
  const colors = ['#006e60', '#355a8a', '#a94c19'];
  result.assignments.forEach((c, index) => {
    const row = node('div', '', `assignment${c.ambulance_id ? '' : ' unserved'}`), description = node('div', '');
    row.dataset.incidentId = c.incident_id;
    description.append(node('strong', c.ambulance_id ? `${c.ambulance_id} → ${c.incident_id} → ${c.hospital_id}` : `${c.incident_id} · unserved`));
    description.append(node('small', c.ambulance_id ? `Response ${c.response_minutes.toFixed(1)} min · transport ${c.transport_minutes.toFixed(1)} min` : 'No resource assigned under the current capability, availability and shared-slot constraints.'));
    row.append(description, node('span', `Cost ${c.cost.toFixed(2)}`)); $('#assignments').append(row);
    const layers = c.legs.map((geometry, leg) => L.geoJSON(geometry, { style: { color: colors[index % colors.length], weight: 4, opacity: 0.9, dashArray: result.travel_source === 'synthetic' || leg === 1 ? '7 5' : null } }).addTo(connectors));
    allocationLayers.set(c.incident_id, layers);
    if (c.ambulance_id) {
      const inspect = node('button', 'Show on map', 'inspect-assignment');
      inspect.type = 'button'; inspect.setAttribute('aria-label', `Show ${c.incident_id} allocation on map`);
      inspect.addEventListener('click', () => inspectAssignment(c.incident_id));
      row.append(inspect);
    }
  });
  $('#model-details').hidden = false;
  $('#model-summary').textContent = `${result.qubit_count} retained variables from ${result.full_choice_count} full choices. Reduced exact objective: ${result.reduced_exact_objective.toFixed(2)}. Quantum status: ${result.quantum.status}. ${result.quantum.message} Feasible probability: ${(result.quantum.feasible_probability * 100).toFixed(1)}%. ${result.quantum.evaluations} evaluations, ${result.quantum.runtime_ms.toFixed(0)} ms. Objective: severity-weighted response minutes + weighted transport minutes + unserved penalties. ${result.warnings.join(' ')}`;
  $('#model-data').textContent = JSON.stringify({ variable_order: result.variables.map((c, bit) => ({ bit, incident: c.incident_id, ambulance: c.ambulance_id, hospital: c.hospital_id })), offset: result.offset, penalty: result.penalty, qubo_upper_triangle: result.qubo, quantum: result.quantum }, null, 2);
}
form.addEventListener('input', event => { if (!/^(control-|coord-|requires-|hospital-count)/.test(event.target.id)) invalidate(); });
form.addEventListener('invalid', event => {
  // Reveal invalid inputs before the browser tries to focus them.
  for (let parent = event.target.parentElement; parent && parent !== form; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
}, true);

$('#placement-target').addEventListener('change', () => { setPlacementMode(true); setPlacementTarget($('#placement-target').value); });
$('#placement-mode').addEventListener('click', () => setPlacementMode(!placementEnabled));
$('#fit-resources').addEventListener('click', () => {
  if (resources?.getBounds().isValid()) map.fitBounds(resources.getBounds(), { padding: [48, 48], animate: false });
  for (const group of allocationLayers.values()) group.forEach(layer => layer.setStyle({ opacity: 0.9, weight: 4 }));
  for (const row of $('#assignments').children) row.classList.remove('selected');
});
$('#hospital-count').addEventListener('change', async () => {
  const count = $('#hospital-count').value;
  invalidate(); loadingHospitals = true;
  busy(false); $('#hospital-count').disabled = true; $('#reset-demo').disabled = true;
  try {
    const preset = await json(`/api/allocation/demo?hospital_count=${count}`);
    scenario.hospitals = preset.hospitals;
    renderControls(); drawResources();
    map.fitBounds(resources.getBounds(), { padding: [48, 48], animate: false });
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
  scenario.solver = { algorithm: $('#algorithm').value, reps: Number($('#reps').value), maxiter: Number($('#maxiter').value), shots: Number($('#shots').value), seed: Number($('#seed').value) };
  const request = new AbortController(); controller = request;
  const timeout = setTimeout(() => request.abort(), 120000);
  busy(true); status('Building the joint allocation model and running the requested solver…');
  try { const result = await json('/api/allocation/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scenario), signal: request.signal }); if (current === revision) show(result); }
  catch (error) { if (current === revision) status(error.name === 'AbortError' ? 'Optimization timed out. Reduce evaluations or check local OSRM.' : error.message, 'error'); }
  finally { clearTimeout(timeout); if (current === revision) busy(false); }
});
$('#reset-demo').addEventListener('click', async () => {
  invalidate(); const current = revision; $('#reset-demo').disabled = true; $('#optimize').disabled = true;
  try { const fresh = await json(`/api/allocation/demo?hospital_count=${$('#hospital-count').value}`); if (current !== revision) return; scenario = fresh; form.reset(); $('#hospital-count').value = String(fresh.hospitals.length); renderControls(); drawResources(); map.fitBounds(resources.getBounds(), { padding: [48,48], animate: false }); status('Demo reset. All three ambulances and hospital slots are available.'); }
  catch (error) { status(error.message, 'error'); }
  finally { $('#reset-demo').disabled = false; $('#optimize').disabled = false; }
});
try {
  const [initial, config] = await Promise.all([json('/api/allocation/demo'), json('/api/map-config')]);
  scenario = initial; renderControls(); map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView([9.98, 76.30], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('click', event => { if (placementEnabled) moveResource($('#placement-target').value, event.latlng.lat, event.latlng.lng, true); });
  setPlacementMode(true);
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
  const attribution = node('span', config.tile_attribution);
  const tiles = L.tileLayer(config.tile_url, { maxZoom: 19, attribution: attribution.innerHTML }).addTo(map);
  let failedTiles = 0;
  tiles.on('loading', () => { failedTiles = 0; });
  tiles.on('tileerror', () => { failedTiles++; $('#tile-status').hidden = false; $('#tile-status').textContent = 'Basemap tiles unavailable. Check your connection; resource placement still works.'; });
  tiles.on('load', () => { if (failedTiles === 0) $('#tile-status').hidden = true; });
  resources = L.featureGroup().addTo(map); connectors = L.featureGroup().addTo(map); drawResources();
  map.fitBounds(resources.getBounds(), { padding: [48,48], animate: false });
  new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    if (resources.getBounds().isValid()) map.fitBounds(resources.getBounds(), { paddingTopLeft: [56, 64], paddingBottomRight: [56, 80], maxZoom: 16, animate: false });
  }).observe($('#map'));
  $('#optimize').disabled = false; $('#reset-demo').disabled = false;
  status(`${scenario.ambulances.length} ambulances, ${scenario.incidents.length} incidents and ${scenario.hospitals.length} hospital sites. Configure availability, then optimize.`);
} catch (error) { status(`Allocation workspace could not start: ${error.message}`, 'error'); }

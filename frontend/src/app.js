import { buildRequest, formatDistance, formatDuration, routeError } from './routing.js';
import { createMap } from './map-view.js';
import { KERALA_BOUNDS, withinArea } from './operating-area.js';
import { compareRoutes, formatArrival } from './route-comparison.js';
import { buildTripRequests, combineTripRoutes } from './trip-routes.js';

const $ = selector => document.querySelector(selector);
const synthetic = document.body.dataset.mode === 'mock';
const form = $('#route-form');
const fields = [...form.querySelectorAll('input')];
let mapView;
let revision = 0;
let activeRequest;
let hasRequested = false;
let candidates = [];
let selectedId;
let operatingBounds = KERALA_BOUNDS;
let departure;

function point(prefix) {
  const values = [`#${prefix}-lat`, `#${prefix}-lon`].map(id => $(id).valueAsNumber);
  return withinArea(values[0], values[1], operatingBounds) ? values : null;
}

function status(message, state = 'ready') {
  $('#route-status').textContent = message;
  $('#route-status').dataset.state = state;
}

function busy(value) {
  $('#find-route').disabled = value;
  $('#find-route').firstChild.textContent = value ? 'Finding routes… ' : 'Find routes ';
  $('.route-results').setAttribute('aria-busy', String(value));
}

function invalidate(message = 'Locations changed. Find routes to update the map.') {
  revision++;
  activeRequest?.abort();
  busy(false);
  candidates = [];
  selectedId = null;
  mapView?.clear();
  $('#route-options').replaceChildren();
  $('#route-details').replaceChildren();
  $('#route-details').hidden = true;
  $('#route-count').textContent = '';
  $('#timing-source').hidden = true;
  status(message);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function selectRoute(id) {
  const route = candidates.find(candidate => candidate.id === id);
  if (!route) return;
  selectedId = id;
  mapView.select(id);
  for (const button of $('#route-options').children) {
    const selected = button.dataset.id === id;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.option-selection').textContent = selected ? 'Selected' : 'View route';
  }
  const details = $('#route-details');
  details.replaceChildren();
  details.hidden = false;
  const checks = node('details', 'route-checks');
  checks.append(node('summary', 'detail-label', 'Road checks and scoring'));
  const matched = route.segments.filter(segment => segment.road.matched).length;
  checks.append(node('p', 'route-note', `Road attributes matched: ${matched} of ${route.segments.length} segments. Checks cover known restrictions only.`));
  if (route.cost) {
    const c = route.cost;
    checks.append(node('p', 'route-note', `ETA ${formatDuration(route.estimated_time_s)} · road cost ${c.total.toFixed(1)} seconds-equivalent. Narrow roads +${c.suitability_penalty_s.toFixed(1)}, surface +${c.risk_penalty_s.toFixed(1)}, missing data +${(c.uncertainty_penalty_s ?? 0).toFixed(1)}. Cost penalties do not change the displayed ETA.`));
  }
  details.append(checks);
  const notices = [...route.rejection_reasons, ...route.warnings];
  if (notices.length) {
    const disclosure = node('details', 'route-notices');
    disclosure.append(node('summary', 'detail-label', `Road data and restrictions (${notices.length})`));
    const list = node('ul', 'detail-list');
    for (const text of notices.slice(0, 12)) list.append(node('li', '', text));
    if (notices.length > 12) list.append(node('li', '', `${notices.length - 12} further notices are included in the API result.`));
    disclosure.append(list);
    details.append(disclosure);
  }
}

function showResults(result) {
  departure = new Date();
  candidates = compareRoutes(result.candidates, result.classical_route?.id);
  if (!candidates.length) {
    status(`No road route was found for the ${result.missingLeg} leg. Move the points onto roads within your map extract and try again.`, 'error');
    return;
  }
  selectedId = result.classical_route?.id ?? candidates.find(route => route.feasible)?.id ?? candidates[0].id;
  $('#route-count').textContent = `${candidates.length} found`;
  $('#timing-source').hidden = false;
  $('#timing-source').textContent = synthetic ? 'Example timings · synthetic data'
    : `No live traffic · departure ${formatArrival(0, departure)}`;
  const options = $('#route-options');
  candidates.forEach((route, index) => {
    const button = node('button', `route-option${route.feasible ? '' : ' rejected'}`);
    button.type = 'button';
    button.dataset.id = route.id;
    const top = node('span', 'option-top');
    top.append(node('span', '', `Route ${index + 1}`), node('span', 'option-badge', route.badge));
    const bottom = node('span', 'option-bottom');
    bottom.append(node('strong', 'option-duration', formatDuration(route.estimated_time_s)), node('span', '', formatDistance(route.distance_m)));
    const legs = node('span', 'option-legs');
    legs.append(node('span', '', `To incident ${formatDuration(route.legs[0].estimated_time_s)}`),
      node('span', '', `To hospital ${formatDuration(route.legs[1].estimated_time_s)}`));
    const arrival = node('span', 'option-arrival', route.feasible
      ? `Hospital arrival ${formatArrival(route.estimated_time_s, departure)}` : 'Rejected · not suggested for dispatch');
    const footer = node('span', 'option-footer');
    footer.append(node('span', '', route.difference), node('span', 'option-selection', 'View route'));
    button.append(top, bottom, legs, arrival, footer);
    button.addEventListener('click', () => selectRoute(route.id));
    options.append(button);
  });
  mapView.show(candidates, selectedId);
  selectRoute(selectedId);
  status(result.status === 'success'
    ? (synthetic ? 'Synthetic example routes loaded. These fixed routes do not follow the selected locations.' : candidates.length === 1
      ? 'One route found. No alternatives are available for these locations.'
      : 'Compare the routes below. Select a route to highlight it on the map.')
    : 'All candidates failed the known road checks. Dashed routes are shown for inspection only.',
  result.status === 'success' ? 'ready' : 'error');
  $('.route-results').scrollIntoView({ block: 'start' });
}

async function findRoutes() {
  if (!form.reportValidity() || !mapView) return;
  hasRequested = true;
  invalidate();
  const current = revision;
  let bodies;
  try { bodies = buildTripRequests(point('origin') ?? [], point('incident') ?? [], point('destination') ?? []); }
  catch (error) { status(error.message, 'error'); return; }
  const controller = new AbortController();
  activeRequest = controller;
  const timer = setTimeout(() => controller.abort(), 20000);
  status(synthetic ? 'Loading synthetic example routes…' : 'Finding road routes from local OSRM…', 'loading');
  busy(true);
  try {
    const legs = await Promise.all(bodies.map(async body => {
      const response = await fetch('/api/emergency/route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        if (failure?.error?.code === 'BACKEND_UNAVAILABLE') {
          throw new Error('Cannot reach the backend. Start it and check BACKEND_TARGET, then try again.');
        }
        throw new Error(failure?.error?.code === 'ROAD_INDEX_UNAVAILABLE'
          ? 'Road attributes could not be loaded. Rebuild the road index and restart the app.'
          : failure?.error?.code === 'LOCATION_NOT_ROUTABLE'
          ? 'No routable road within 100 m of a location. Move the points closer to a road within your map extract.'
          : routeError(response.status));
      }
      return response.json();
    }));
    if (current !== revision) return;
    showResults(combineTripRoutes(...legs));
  } catch (error) {
    controller.abort();
    if (current === revision) status(error.name === 'AbortError'
      ? 'Routing took too long. Check local OSRM and try again.'
      : (error instanceof TypeError ? 'Cannot reach the backend. Check that the app is running and try again.' : error.message), 'error');
  } finally {
    clearTimeout(timer);
    if (current === revision) busy(false);
  }
}

function pick(prefix) {
  mapView?.pick(prefix);
  for (const key of ['origin', 'incident', 'destination']) $(`#pick-${key}`).setAttribute('aria-pressed', String(key === prefix));
}

function updateMarkers() { mapView?.updateMarkers(point('origin'), point('incident'), point('destination')); }

function movePoint(prefix, coordinates) {
  if (!withinArea(coordinates[0], coordinates[1], operatingBounds)) {
    updateMarkers();
    status('Choose a location inside the Kerala operating area.', 'error');
    return;
  }
  $(`#${prefix}-lat`).value = coordinates[0].toFixed(6);
  $(`#${prefix}-lon`).value = coordinates[1].toFixed(6);
  if (prefix === 'destination') $('#hospital-selection').textContent = 'Custom hospital location';
  invalidate();
  updateMarkers();
  const points = ['origin', 'incident', 'destination'];
  pick(points[(points.indexOf(prefix) + 1) % points.length]);
  mapView?.focus(coordinates);
  if (hasRequested) findRoutes();
}

async function useLocation() {
  const button = $('#use-location');
  const message = $('#location-status');
  message.dataset.state = 'ready';
  if (!window.isSecureContext || !navigator.geolocation) {
    message.textContent = 'Location is unavailable in this browser. Open the app on localhost or HTTPS, or enter coordinates.';
    message.dataset.state = 'error';
    return;
  }
  const current = revision;
  button.disabled = true;
  button.textContent = 'Finding location…';
  message.textContent = 'Allow location access in your browser when prompted.';
  try {
    // One-time device fix; do not start background tracking or store the location.
    // https://www.w3.org/TR/geolocation/#getcurrentposition-method
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
    if (current !== revision) {
      message.textContent = 'Locations changed during lookup. Click Use my location to try again.';
      return;
    }
    const { latitude, longitude, accuracy } = position.coords;
    buildRequest([latitude, longitude], [latitude, longitude]);
    movePoint('origin', [latitude, longitude]);
    message.textContent = Number.isFinite(accuracy) && accuracy >= 0
      ? `Starting point updated. Approximate accuracy: ${Math.round(accuracy)} m.`
      : 'Starting point updated. Check the marker before finding a route.';
  } catch (error) {
    const errors = {
      1: 'Location permission denied. Allow location access in your browser settings, or enter coordinates.',
      2: 'Location could not be determined. Check device location services, or enter coordinates.',
      3: 'Location lookup timed out. Try again outdoors or enter coordinates.',
    };
    message.textContent = errors[error?.code] ?? (error instanceof RangeError ? error.message : 'Location could not be determined. Try again or enter coordinates.');
    message.dataset.state = 'error';
  } finally {
    button.disabled = false;
    button.textContent = 'Use my location';
  }
}

let readinessPending = false;
async function checkConnection() {
  if (synthetic) {
    $('#connection-status').textContent = 'Synthetic demo data · no routing service connected';
    $('#check-connection').disabled = true;
    return;
  }
  if (readinessPending) return;
  readinessPending = true;
  $('#check-connection').disabled = true;
  $('#connection-status').textContent = 'Checking local OSRM…';
  try {
    const response = await fetch('/api/readiness', { signal: AbortSignal.timeout(18000) });
    if (!response.ok) throw new Error('Readiness check failed');
    const data = await response.json();
    $('#connection-dot').dataset.state = data.osrm;
    $('#connection-status').textContent = data.osrm === 'available'
      ? `OSRM connected · ${data.road_attributes === 'loaded' ? 'road attributes loaded' : 'road attributes unavailable'}`
      : 'OSRM unavailable · start the local routing service';
  } catch {
    $('#connection-dot').dataset.state = 'unavailable';
    $('#connection-status').textContent = 'Connection check failed · try again';
  } finally {
    readinessPending = false;
    $('#check-connection').disabled = false;
  }
}

form.addEventListener('submit', event => { event.preventDefault(); findRoutes(); });
for (const input of fields) {
  input.addEventListener('input', () => { invalidate(); updateMarkers(); });
  if (input.id.startsWith('destination-')) input.addEventListener('input', () => { $('#hospital-selection').textContent = 'Custom hospital location'; });
  input.addEventListener('change', () => {
    const location = point(input.id.split('-')[0]);
    if (location) mapView?.focus(location);
    if (hasRequested && form.checkValidity()) findRoutes();
  });
}
for (const prefix of ['origin', 'incident', 'destination']) $(`#pick-${prefix}`).addEventListener('click', () => pick(prefix));
$('#swap').addEventListener('click', () => {
  $('#hospital-selection').textContent = 'Custom hospital location';
  for (const axis of ['lat', 'lon']) {
    const a = $(`#origin-${axis}`), b = $(`#destination-${axis}`);
    [a.value, b.value] = [b.value, a.value];
  }
  invalidate(); updateMarkers();
  if (hasRequested) findRoutes();
});
$('#fit-map').addEventListener('click', () => mapView?.fit());
$('#choose-hospital').addEventListener('click', () => mapView?.chooseHospital());
$('#check-connection').addEventListener('click', checkConnection);
$('#use-location').addEventListener('click', useLocation);
$('#toggle-planner').addEventListener('click', () => {
  const button = $('#toggle-planner');
  const content = $('#planner-content');
  content.hidden = !content.hidden;
  button.setAttribute('aria-expanded', String(!content.hidden));
  button.setAttribute('aria-label', content.hidden ? 'Show planner' : 'Hide planner');
  button.textContent = content.hidden ? '+' : '−';
});

try {
  const response = await fetch('/api/map-config');
  if (!response.ok) throw new Error('Map configuration could not be loaded. Restart the app and try again.');
  const config = await response.json();
  operatingBounds = config.operating_bounds ?? KERALA_BOUNDS;
  for (const input of fields) {
    const axis = input.id.endsWith('-lat') ? 0 : 1;
    input.min = operatingBounds[0][axis]; input.max = operatingBounds[1][axis];
  }
  mapView = createMap(config, movePoint, selectRoute, hospital => {
    movePoint('destination', [hospital.latitude, hospital.longitude]);
    $('#hospital-selection').textContent = `Selected: ${hospital.name}`;
    $('#choose-hospital').focus({ preventScroll: true });
  });
  updateMarkers();
  $('#use-location').disabled = false;
  checkConnection();
} catch (error) {
  status(error.message, 'error');
  $('#find-route').disabled = true;
  $('#connection-status').textContent = 'Map could not start · reload the page';
}

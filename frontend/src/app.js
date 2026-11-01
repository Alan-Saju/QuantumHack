import { buildRequest, formatDistance, formatDuration, routeError } from './routing.js';
import { createMap } from './map-view.js';

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

function point(prefix) {
  const values = [`#${prefix}-lat`, `#${prefix}-lon`].map(id => $(id).valueAsNumber);
  return values.every(Number.isFinite) && Math.abs(values[0]) <= 90 && Math.abs(values[1]) <= 180 ? values : null;
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
  for (const button of $('#route-options').children) button.setAttribute('aria-pressed', String(button.dataset.id === id));
  const details = $('#route-details');
  details.replaceChildren();
  details.hidden = false;
  const matched = route.segments.filter(segment => segment.road.matched).length;
  details.append(node('p', 'route-note', `Road attributes matched: ${matched} of ${route.segments.length} segments. Checks cover known restrictions only.`));
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
  candidates = result.candidates;
  if (!candidates.length) {
    status('No road route was found. Move the points onto roads within your map extract and try again.', 'error');
    return;
  }
  selectedId = result.classical_route?.id ?? candidates[0].id;
  $('#route-count').textContent = `${candidates.length} found`;
  const options = $('#route-options');
  candidates.forEach((route, index) => {
    const button = node('button', `route-option${route.feasible ? '' : ' rejected'}`);
    button.type = 'button';
    button.dataset.id = route.id;
    const top = node('span', 'option-top');
    top.append(node('span', '', `Route ${index + 1}`), node('span', 'option-badge', route.feasible ? 'Known checks passed' : 'Rejected · inspect only'));
    const bottom = node('span', 'option-bottom');
    bottom.append(node('span', '', formatDuration(route.estimated_time_s)), node('span', '', formatDistance(route.distance_m)));
    button.append(top, bottom);
    button.addEventListener('click', () => selectRoute(route.id));
    options.append(button);
  });
  mapView.show(candidates, selectedId);
  selectRoute(selectedId);
  status(result.status === 'success'
    ? (synthetic ? 'Synthetic example routes loaded. These fixed routes do not follow the selected locations.' : 'Routes loaded from local OSRM. Travel times exclude simulated traffic.')
    : 'All candidates failed the known road checks. Dashed routes are shown for inspection only.',
  result.status === 'success' ? 'ready' : 'error');
}

async function findRoutes() {
  if (!form.reportValidity() || !mapView) return;
  hasRequested = true;
  invalidate();
  const current = revision;
  let body;
  try { body = buildRequest(point('origin') ?? [], point('destination') ?? []); }
  catch (error) { status(error.message, 'error'); return; }
  const controller = new AbortController();
  activeRequest = controller;
  const timer = setTimeout(() => controller.abort(), 20000);
  status(synthetic ? 'Loading synthetic example routes…' : 'Finding road routes from local OSRM…', 'loading');
  busy(true);
  try {
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
        : routeError(response.status));
    }
    const result = await response.json();
    if (current !== revision) return;
    showResults(result);
  } catch (error) {
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
  for (const key of ['origin', 'destination']) $(`#pick-${key}`).setAttribute('aria-pressed', String(key === prefix));
}

function updateMarkers() { mapView?.updateMarkers(point('origin'), point('destination')); }

function movePoint(prefix, coordinates) {
  $(`#${prefix}-lat`).value = coordinates[0].toFixed(6);
  $(`#${prefix}-lon`).value = coordinates[1].toFixed(6);
  invalidate();
  updateMarkers();
  pick(prefix === 'origin' ? 'destination' : 'origin');
  if (hasRequested) findRoutes();
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
  input.addEventListener('change', () => { if (hasRequested && form.checkValidity()) findRoutes(); });
}
for (const prefix of ['origin', 'destination']) $(`#pick-${prefix}`).addEventListener('click', () => pick(prefix));
$('#swap').addEventListener('click', () => {
  for (const axis of ['lat', 'lon']) {
    const a = $(`#origin-${axis}`), b = $(`#destination-${axis}`);
    [a.value, b.value] = [b.value, a.value];
  }
  invalidate(); updateMarkers();
  if (hasRequested) findRoutes();
});
$('#fit-map').addEventListener('click', () => mapView?.fit());
$('#check-connection').addEventListener('click', checkConnection);

try {
  const response = await fetch('/api/map-config');
  if (!response.ok) throw new Error('Map configuration could not be loaded. Restart the app and try again.');
  mapView = createMap(await response.json(), movePoint, selectRoute);
  updateMarkers();
  checkConnection();
} catch (error) {
  status(error.message, 'error');
  $('#find-route').disabled = true;
  $('#connection-status').textContent = 'Map could not start · reload the page';
}

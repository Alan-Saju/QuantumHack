// Real allocation API and real Qiskit simulator; only background map tiles are stubbed.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.APP_URL ?? 'http://127.0.0.1:8000';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let optimizationRequests = 0;
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('request', request => { if (request.url().endsWith('/api/allocation/optimize')) optimizationRequests++; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#optimize').disabled);
  assert.equal(await page.locator('.resource-marker').count(), 9);
  assert.equal(await page.locator('#require-known-width').isDisabled(), true);
  assert.equal(await page.locator('.leaflet-marker-draggable').count(), 6);
  assert.equal(await page.locator('#fleet-count').textContent(), '3');
  assert.equal(await page.locator('#hospital-slot-count').textContent(), '3');
  assert.equal(await page.locator('#hospital-count option').count(), 1);
  assert.equal(await page.locator('#vehicle-A3-type').inputValue(), 'omini');
  await page.locator('#vehicle-A1-type').selectOption('omini');
  assert.equal(await page.locator('#vehicle-A1-width_m').inputValue(), '1.6');
  assert.equal(await page.locator('#vehicle-A1-height_m').inputValue(), '2');
  assert.equal(await page.locator('#vehicle-A1-weight_t').inputValue(), '1.5');
  await page.locator('.vehicle-dimensions > summary').first().click();
  await page.locator('#vehicle-A1-width_m').fill('1.8');
  assert.match(await page.locator('#vehicle-A1-summary').textContent(), /customized demo profile/);
  await page.locator('.vehicle-dimensions > summary').first().click();
  await page.locator('#vehicle-A1-type').selectOption('traveller');
  assert.equal(await page.locator('#vehicle-A1-width_m').inputValue(), '2.4');
  for (const name of ['Sunrise Hospital', 'Gautham Hospital', 'Aster Medicity']) {
    assert.match(await page.locator('#hospitals').textContent(), new RegExp(name));
  }
  const initialA1Latitude = await page.locator('#coord-A1-latitude').inputValue();
  await page.locator('#coord-A1-latitude').fill('14');
  await page.locator('#coord-A1-latitude').blur();
  assert.equal(await page.locator('#coord-A1-latitude').inputValue(), initialA1Latitude);
  assert.match(await page.locator('#status').textContent(), /Kerala/);
  if (await page.locator('.leaflet-control-zoom-out').getAttribute('aria-disabled') !== 'true') {
    await page.locator('.leaflet-control-zoom-out').click({ clickCount: 10, delay: 350 });
  }
  // Leaflet updates the disabled state when its zoom animation finishes.
  await page.waitForFunction(() => document.querySelector('.leaflet-control-zoom-out').getAttribute('aria-disabled') === 'true');
  assert.equal(await page.locator('.leaflet-control-zoom-out').getAttribute('aria-disabled'), 'true');
  await page.locator('#fit-resources').click();
  // Native buttons expose placement mode through keyboard and ARIA state.
  await page.locator('#placement-mode').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#placement-mode').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#placement-mode').getAttribute('aria-pressed'), 'true');
  // Exploring the map must not move resources. Selecting a shortcut returns to placement.
  const beforeExplore = await page.locator('#coord-A1-latitude').inputValue();
  await page.locator('#placement-mode').click();
  await page.locator('#map').click({ position: { x: 200, y: 160 } });
  assert.equal(await page.locator('#coord-A1-latitude').inputValue(), beforeExplore);
  assert.equal(await page.locator('#placement-mode').getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Place A1 on map', exact: true }).first().click();
  assert.equal(await page.locator('#placement-mode').getAttribute('aria-pressed'), 'true');
  const fixedHospitalPositions = await page.locator('.resource-marker.hospital').evaluateAll(markers => markers.map(m => m.style.transform));
  const originalLatitude = await page.locator('#coord-A1-latitude').inputValue();
  await page.locator('#placement-target').selectOption('A1');
  await page.locator('#map').click({ position: { x: 300, y: 220 } });
  assert.notEqual(await page.locator('#coord-A1-latitude').inputValue(), originalLatitude);
  assert.equal(await page.locator('#placement-target').inputValue(), 'A2');
  const movedA1Latitude = await page.locator('#coord-A1-latitude').inputValue();
  assert.deepEqual(await page.locator('.resource-marker.hospital').evaluateAll(markers => markers.map(m => m.style.transform)), fixedHospitalPositions);

  const originalA2Longitude = await page.locator('#coord-A2-longitude').inputValue();
  const markerBox = await page.locator('.resource-marker.ambulance[title^="A2:"]').boundingBox();
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + 60, markerBox.y + 30, { steps: 8 });
  await page.mouse.up();
  assert.notEqual(await page.locator('#coord-A2-longitude').inputValue(), originalA2Longitude);

  await page.locator('#coord-I1-latitude').fill('9.979');
  await page.locator('#coord-I1-longitude').fill('76.310');
  await page.locator('#coord-I1-longitude').blur();
  assert.equal(await page.locator('.resource-marker.hospital').count(), 3);
  assert.equal(await page.locator('.resource-marker').count(), 9);
  assert.equal(await page.locator('#coord-A1-latitude').inputValue(), movedA1Latitude);
  assert.equal(await page.locator('#coord-I1-latitude').inputValue(), '9.979000');
  const manuallyPlacedResponse = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'));
  await page.locator('#optimize').click();
  const placedResponse = await manuallyPlacedResponse;
  const placedBody = placedResponse.request().postDataJSON();
  assert.equal(placedBody.hospitals.length, 3);
  assert.equal(placedBody.ambulances[0].latitude, Number(movedA1Latitude));
  assert.equal(placedBody.incidents[0].latitude, 9.979);
  assert.equal(placedBody.incidents[0].longitude, 76.310);
  assert.equal(placedResponse.status(), 200);
  assert.deepEqual(placedBody.hospitals.map(h => [h.name, h.latitude, h.longitude]), [
    ['Sunrise Hospital', 10.025185, 76.338884], ['Gautham Hospital', 9.952000, 76.2990001], ['Aster Medicity', 10.0469447, 76.3352506],
  ]);
  await page.locator('#reset-demo').click();
  await page.waitForFunction(() => !document.querySelector('#optimize').disabled);
  let responsePromise = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'));
  await page.locator('#optimize').click();
  let result = await (await responsePromise).json();
  assert.equal(result.status, 'complete');
  await page.locator('.assignment').nth(2).waitFor();
  assert.equal(await page.locator('.assignment').count(), 3);
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), 6);
  assert.equal(await page.locator('.fleet-ambulance').count(), 3);
  const beforeTrip = optimizationRequests;
  const a1 = result.assignments.find(assignment => assignment.ambulance_id === 'A1');
  // At the fleet-wide zoom nearby vehicles can overlap; markers also expose keyboard activation.
  await page.locator('.resource-marker.ambulance[title^="A1:"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#ambulance-trip:not([hidden])').waitFor();
  assert.match(await page.locator('#trip-title').textContent(), /A1 · Traveller/);
  assert.match(await page.locator('.trip-total strong').textContent(), new RegExp(`${(a1.response_minutes + a1.transport_minutes).toFixed(1)} min`));
  assert.match(await page.locator('.trip-response .trip-stop-heading strong').textContent(), new RegExp(`${a1.response_minutes.toFixed(1)} min`));
  assert.match(await page.locator('.trip-transport .trip-stop-heading strong').textContent(), new RegExp(`${a1.transport_minutes.toFixed(1)} min`));
  assert.match(await page.locator('#trip-content').textContent(), /IST/);
  assert.match(await page.locator('#trip-content').textContent(), /not live tracked/);
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), 2);
  assert.equal(await page.locator('.resource-marker').count(), 3);
  assert.equal(await page.locator('.leaflet-marker-draggable').count(), 0);
  assert.equal(await page.locator('aside').isVisible(), false);
  await page.screenshot({ path: new URL('ambulance-trip-desktop.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.locator('#back-to-dashboard').click();
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), 6);
  assert.equal(await page.locator('.resource-marker').count(), 9);
  assert.equal(await page.locator('#placement-mode').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#trip-content').textContent(), '');
  await page.locator('#fleet-snapshot button[data-ambulance-id="A2"]').focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#trip-title').textContent(), /A2/);
  assert.equal(await page.locator('#trip-title').evaluate(element => element === document.activeElement), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL('ambulance-trip-mobile.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), 2);
  await page.locator('#back-to-dashboard').click();
  assert.equal(await page.locator('#fleet-snapshot button[data-ambulance-id="A2"]').evaluate(element => element === document.activeElement), true);
  assert.equal(optimizationRequests, beforeTrip, 'Inspecting and returning never reoptimizes');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let zoom = 0; zoom < 2; zoom++) {
    await page.locator('.leaflet-control-zoom-in').click();
    await page.waitForTimeout(350);
  }
  await page.locator('.resource-marker.ambulance[title^="A1:"]').click();
  assert.match(await page.locator('#trip-title').textContent(), /A1/);
  await page.locator('#back-to-dashboard').click();
  assert.equal(optimizationRequests, beforeTrip, 'Mouse inspection does not request another optimization');
  await page.getByRole('button', { name: 'Show I1 allocation on map' }).click();
  assert.equal(await page.locator('.assignment.selected').count(), 1);
  await page.locator('#fit-resources').click();
  assert.equal(await page.locator('.assignment.selected').count(), 0);
  await page.screenshot({ path: new URL('allocation-desktop.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });

  await page.locator('#control-H2').uncheck();
  assert.equal(await page.locator('#hospital-slot-count').textContent(), '2');
  assert.equal(await page.locator('.assignment').count(), 0);
  responsePromise = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'));
  await page.locator('#optimize').click();
  result = await (await responsePromise).json();
  assert.deepEqual(result.unserved, ['I2']);
  await page.locator('.unserved').waitFor();
  assert.match(await page.locator('.unserved').textContent(), /I2/);
  const unusedAmbulance = ['A1', 'A2', 'A3'].find(id => !result.assignments.some(choice => choice.ambulance_id === id));
  await page.locator(`#fleet-snapshot button[data-ambulance-id="${unusedAmbulance}"]`).click();
  assert.equal(await page.locator('.trip-status').textContent(), 'Available / unassigned');
  assert.equal(await page.locator('.trip-total').count(), 0);
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), 0);
  await page.locator('#back-to-dashboard').click();
  await page.locator('#control-A3').uncheck();
  assert.equal(await page.locator('#fleet-snapshot').isVisible(), false);
  responsePromise = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'));
  await page.locator('#optimize').click();
  await responsePromise;
  await page.locator('#fleet-snapshot button[data-ambulance-id="A3"]').click();
  assert.equal(await page.locator('.trip-status').textContent(), 'Unavailable');
  assert.equal(await page.locator('.trip-total').count(), 0);
  await page.locator('#back-to-dashboard').click();
  await page.locator('#vehicle-A1-type').selectOption('omini');
  assert.equal(await page.locator('#fleet-snapshot').isVisible(), false);
  assert.equal(await page.locator('.assignment').count(), 0);

  await page.locator('#reset-demo').click();
  await page.waitForFunction(() => !document.querySelector('#optimize').disabled);
  assert.match(await page.locator('#status').textContent(), /Demo reset/);
  assert.equal(await page.locator('#solver-switch').isVisible(), false);
  await page.locator('#advanced-settings > summary').click();
  await page.locator('#maxiter').fill('10');
  responsePromise = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'), { timeout: 60000 });
  await page.locator('#optimize').click();
  result = await (await responsePromise).json();
  assert.equal(result.quantum.status, 'completed');
  assert.equal(result.objective, result.exact_objective);
  const beforeSwitch = optimizationRequests;
  const beforeCollapseWidth = (await page.locator('#map').boundingBox()).width;
  const savedCoordinate = await page.locator('#coord-A1-latitude').inputValue();
  await page.locator('#collapse-scenario').click();
  assert.equal(await page.locator('#scenario-panel').isVisible(), false);
  assert.equal(await page.locator('#expand-scenario').isVisible(), true);
  assert.ok((await page.locator('#map').boundingBox()).width > beforeCollapseWidth, 'Collapsing gives the map more space');
  await page.locator('#view-qaoa').click();
  assert.equal(await page.locator('#view-qaoa').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.unserved').count(), result.quantum.assignments.filter(c => c.ambulance_id === null).length);
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), result.quantum.assignments.reduce((n, c) => n + c.legs.length, 0));
  assert.equal(await page.locator('.metric strong').nth(1).textContent(), result.quantum.objective.toFixed(2));
  assert.match(await page.locator('.fleet-caption').textContent(), /QAOA/);
  await page.screenshot({ path: new URL('allocation-qaoa.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.locator('#fleet-snapshot button[data-ambulance-id="A1"]').click();
  assert.match(await page.locator('#trip-content').textContent(), /QAOA allocation snapshot/);
  await page.locator('#view-classical').click();
  assert.equal(await page.locator('#ambulance-trip').isVisible(), true);
  assert.match(await page.locator('#trip-content').textContent(), /Classical allocation snapshot/);
  const classicalA1 = result.exact_assignments.find(c => c.ambulance_id === 'A1');
  assert.match(await page.locator('.trip-total strong').textContent(), new RegExp(`${(classicalA1.response_minutes + classicalA1.transport_minutes).toFixed(1)} min`));
  await page.locator('#back-to-dashboard').click();
  assert.equal(await page.locator('.metric strong').nth(1).textContent(), result.exact_objective.toFixed(2));
  assert.equal(await page.locator('#view-classical').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#map-note').textContent(), /^Classical/);
  await page.locator('#expand-scenario').click();
  assert.equal(await page.locator('#scenario-panel').isVisible(), true);
  assert.equal(await page.locator('#coord-A1-latitude').inputValue(), savedCoordinate);
  assert.equal(optimizationRequests, beforeSwitch, 'Switching solvers never reoptimizes');
  await page.screenshot({ path: new URL('allocation-classical.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.locator('#view-qaoa').click();
  await page.locator('#model-details').waitFor();
  await page.locator('#model-details summary').click();
  assert.match(await page.locator('#model-data').textContent(), /expectation_trace/);
  console.log(JSON.stringify({ qubits: result.qubit_count, fullChoices: result.full_choice_count, exactObjective: result.exact_objective, qaoaObjective: result.quantum.objective, qaoaGap: result.qaoa_gap_percent, feasibleProbability: result.quantum.feasible_probability, selectedSolver: result.selected_solver }));

  // Required breakpoints retain a usable map and no horizontal overflow.
  for (const [width, height] of [[320, 960], [768, 960], [1024, 960], [1440, 960], [1024, 720]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
    const bounds = await page.locator('#map').boundingBox();
    assert.ok(bounds.height >= 220 && bounds.width >= 250, `Usable map at ${width}px`);
    if (width >= 1024) {
      const action = await page.locator('#optimize').boundingBox();
      assert.ok(action.y >= 0 && action.y + action.height <= height, 'Primary action remains visible');
      const results = await page.locator('.result-heading').boundingBox();
      assert.ok(results.y + results.height <= height, 'Allocation decision remains reachable');
    } else {
      const action = await page.locator('#optimize').boundingBox();
      assert.ok(action.y >= 0 && action.y + action.height <= height, 'Mobile action stays reachable');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL('allocation-mobile.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.resource-marker').count(), 9);

  await page.locator('#collapse-scenario').click();
  assert.equal(await page.locator('#scenario-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#expand-scenario').click();
  assert.equal(await page.locator('#scenario-panel').isVisible(), true);

  // Identical outputs are explained explicitly; a switch must still update the solver labels.
  const identical = structuredClone(result);
  identical.quantum.assignments = identical.exact_assignments;
  identical.quantum.objective = identical.exact_objective;
  identical.quantum.plan_valid = true;
  identical.quantum.status = 'completed';
  await page.route('**/api/allocation/optimize', route => route.fulfill({ json: identical }));
  await page.locator('#optimize').click();
  await page.waitForFunction(() => document.querySelector('#solver-note').textContent.includes('identical assignments'));
  const sameRunRequests = optimizationRequests;
  await page.locator('#view-qaoa').click();
  assert.equal(await page.locator('.metric strong').nth(1).textContent(), result.exact_objective.toFixed(2));
  assert.match(await page.locator('#map-note').textContent(), /^QAOA/);
  await page.locator('#view-classical').click();
  assert.match(await page.locator('#map-note').textContent(), /^Classical/);
  assert.equal(optimizationRequests, sameRunRequests);
  await page.unroute('**/api/allocation/optimize');

  // Missing quantum output stays unavailable instead of displaying a classical plan under QAOA.
  const unavailable = structuredClone(result);
  unavailable.quantum = { ...unavailable.quantum, status: 'unavailable', plan_valid: false,
    assignments: null, objective: null, message: 'QAOA dependencies unavailable for this test.' };
  await page.route('**/api/allocation/optimize', route => route.fulfill({ json: unavailable }));
  await page.locator('#optimize').click();
  await page.waitForFunction(() => document.querySelector('#solver-note').textContent.includes('QAOA view unavailable'));
  assert.equal(await page.locator('#view-qaoa').isDisabled(), true);
  assert.equal(await page.locator('#view-classical').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.metric strong').nth(1).textContent(), result.exact_objective.toFixed(2));
  await page.unroute('**/api/allocation/optimize');

  // Deterministic road-mode display fixture; backend road scoring is tested separately.
  await page.locator('#travel-source').selectOption('osrm');
  assert.equal(await page.locator('#solver-switch').isVisible(), false, 'Scenario edits discard both cached views');
  await page.locator('#road-settings > summary').click();
  await page.locator('#require-known-width').check();
  await page.locator('#consider-traffic').check();
  await page.locator('.vehicle-dimensions > summary').first().click();
  await page.locator('#vehicle-A1-width_m').fill('2.2');
  const roadResult = structuredClone(result);
  roadResult.travel_source = 'osrm'; roadResult.traffic_source = 'simulated';
  for (const choice of roadResult.assignments) {
    for (const leg of choice.leg_details) {
      leg.cost.uncertainty_penalty_s = 12;
      leg.cost.total = leg.cost.travel_time_s + 12;
      leg.road_coverage = { segment_count: 10, matched_count: 10, known_width_count: 10, known_surface_count: 0 };
      leg.warnings = ['Surface information unknown.'];
    }
  }
  roadResult.exact_assignments = roadResult.assignments;
  await page.route('**/api/allocation/optimize', route => {
    const body = route.request().postDataJSON();
    assert.equal(body.ambulances[0].width_m, 2.2);
    assert.equal(body.require_known_width, true);
    assert.equal(body.consider_traffic, true);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(roadResult) });
  });
  await page.locator('#optimize').click();
  await page.locator('.road-leg-details').first().waitFor();
  await page.locator('.road-leg-details > summary').first().click();
  assert.match(await page.locator('.road-leg-details').first().textContent(), /mapped width 10\/10/);
  assert.match(await page.locator('.road-leg-details').first().textContent(), /missing data \+12.0/);
  assert.match(await page.locator('#map-note').textContent(), /simulated traffic/);
  await page.unroute('**/api/allocation/optimize');

  // A failed request clears previous allocations and reports the actual error.
  await page.route('**/api/allocation/optimize', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'OSRM is unavailable for this test.' } }) }));
  await page.locator('#optimize').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'error');
  assert.equal(await page.locator('.assignment').count(), 0);
  assert.match(await page.locator('#status').textContent(), /OSRM is unavailable/);
  assert.deepEqual(errors, []);
  const stalePage = await browser.newPage();
  try {
    await stalePage.route('**/api/allocation/demo', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' }));
    await stalePage.goto(url);
    await stalePage.waitForFunction(() => document.querySelector('#status').dataset.state === 'error');
    assert.match(await stalePage.locator('#status').textContent(), /Restart the project backend/);
    assert.equal(await stalePage.locator('#optimize').isDisabled(), true);
  } finally { await stalePage.close(); }
  const offlineMap = await browser.newPage();
  try {
    await offlineMap.route('https://tile.openstreetmap.org/**', route => route.abort());
    await offlineMap.goto(url);
    await offlineMap.locator('#tile-status:not([hidden])').waitFor();
    assert.match(await offlineMap.locator('#tile-status').textContent(), /resource placement still works/);
    assert.equal(await offlineMap.locator('.resource-marker').count(), 9);
    assert.equal(await offlineMap.locator('#optimize').isEnabled(), true);
  } finally { await offlineMap.close(); }
  console.log('Allocation browser checks passed: placement, vehicle profiles, ambulance trips and timings, marker/keyboard selection, back navigation, unassigned/unavailable states, exact allocation, real QAOA, responsive layout and errors.');
} finally { await browser.close(); }

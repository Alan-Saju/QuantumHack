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
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#optimize').disabled);
  assert.equal(await page.locator('.resource-marker').count(), 9);
  assert.equal(await page.locator('.leaflet-marker-draggable').count(), 6);
  assert.equal(await page.locator('#fleet-count').textContent(), '3');
  assert.equal(await page.locator('#hospital-slot-count').textContent(), '3');
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
  await page.locator('#hospital-count').selectOption('5');
  await page.waitForFunction(() => document.querySelectorAll('.resource-marker.hospital').length === 5);
  assert.equal(await page.locator('.resource-marker').count(), 11);
  assert.equal(await page.locator('#coord-A1-latitude').inputValue(), movedA1Latitude);
  assert.equal(await page.locator('#coord-I1-latitude').inputValue(), '9.979000');
  await page.locator('#algorithm').selectOption('exact');
  const manuallyPlacedResponse = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'));
  await page.locator('#optimize').click();
  const placedResponse = await manuallyPlacedResponse;
  const placedBody = placedResponse.request().postDataJSON();
  assert.equal(placedBody.hospitals.length, 5);
  assert.equal(placedBody.ambulances[0].latitude, Number(movedA1Latitude));
  assert.equal(placedBody.incidents[0].latitude, 9.979);
  assert.equal(placedBody.incidents[0].longitude, 76.310);
  assert.equal(placedResponse.status(), 200);
  await page.locator('#hospital-count').selectOption('3');
  await page.waitForFunction(() => document.querySelectorAll('.resource-marker.hospital').length === 3);
  await page.locator('#reset-demo').click();
  await page.waitForFunction(() => !document.querySelector('#optimize').disabled);
  await page.locator('#algorithm').selectOption('exact');
  let responsePromise = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'));
  await page.locator('#optimize').click();
  let result = await (await responsePromise).json();
  assert.equal(result.status, 'complete');
  await page.locator('.assignment').nth(2).waitFor();
  assert.equal(await page.locator('.assignment').count(), 3);
  assert.equal(await page.locator('#map path.leaflet-interactive').count(), 6);
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

  await page.locator('#reset-demo').click();
  await page.waitForFunction(() => !document.querySelector('#optimize').disabled);
  assert.match(await page.locator('#status').textContent(), /Demo reset/);
  assert.equal(await page.locator('#algorithm').inputValue(), 'qaoa');
  await page.locator('#advanced-settings > summary').click();
  await page.locator('#maxiter').fill('10');
  responsePromise = page.waitForResponse(r => r.url().endsWith('/api/allocation/optimize'), { timeout: 60000 });
  await page.locator('#optimize').click();
  result = await (await responsePromise).json();
  assert.equal(result.quantum.status, 'completed');
  assert.equal(result.objective, result.exact_objective);
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
  console.log('Allocation browser checks passed: click/drag/manual placement, fixed 3/5 hospital sites, exact allocation, slot contention, real QAOA, responsive layout and outdated-backend errors.');
} finally { await browser.close(); }

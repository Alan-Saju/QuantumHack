// Run against the real FastAPI app. Only routing responses and tile images are mocked.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.APP_URL ?? 'http://127.0.0.1:8000';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
let mode = 'success';
let lastBody;
let requestBodies = [];
let requestCount = 0;
const fixtures = Object.fromEntries(await Promise.all(['success', 'no-route', 'rejected', 'service-failure'].map(async name =>
  [name, JSON.parse(await readFile(new URL(`../../contracts/fixtures/${name}.json`, import.meta.url), 'utf8'))])));

function result(body) {
  const a = [body.ambulance.longitude, body.ambulance.latitude];
  const b = [body.emergency.longitude, body.emergency.latitude];
  const payload = structuredClone(fixtures[mode === 'rejected' ? 'rejected' : 'success'].response);
  // Move the synthetic geometry with user inputs while keeping the shared response shape.
  payload.candidates.forEach((route, index) => {
    route.geometry.coordinates = [a, [(a[0] + b[0]) / 2 + index * 0.005, (a[1] + b[1]) / 2], b];
  });
  if (payload.classical_route) payload.classical_route = payload.candidates.find(route => route.id === payload.classical_route.id);
  if (payload.fallback_route) payload.fallback_route = payload.candidates.find(route => route.id === payload.fallback_route.id);
  return payload;
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let tileZooms = [];
  page.on('pageerror', error => errors.push(error.message));
  // Deterministic tile response; no scraping or dependency on public tile availability.
  await page.route('https://tile.openstreetmap.org/**', route => {
    tileZooms.push(Number(new URL(route.request().url()).pathname.split('/')[1]));
    return route.fulfill({
    contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=', 'base64'),
    });
  });
  await page.route('**/api/readiness', route => route.fulfill({ json: { osrm: 'available', road_attributes: 'loaded' } }));
  await page.route('**/api/emergency/route', async route => {
    requestCount++;
    lastBody = route.request().postDataJSON();
    const body = lastBody;
    requestBodies.push(body);
    assert.equal(lastBody.optimization.consider_traffic, false);
    assert.equal(lastBody.optimization.consider_road_width, true);
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 700));
    if (mode === 'unavailable') return route.fulfill({ status: fixtures['service-failure'].status_code, json: fixtures['service-failure'].response });
    if (mode === 'empty') return route.fulfill({ json: fixtures['no-route'].response });
    if (mode === 'hospital-empty' && body.ambulance.latitude === Number(await page.locator('#incident-lat').inputValue())) {
      return route.fulfill({ json: fixtures['no-route'].response });
    }
    const payload = result(body);
    // Two alternatives to the incident and one to the hospital produce two complete trips.
    if (body.ambulance.latitude === Number(await page.locator('#incident-lat').inputValue())) payload.candidates = payload.candidates.slice(0, 1);
    await route.fulfill({ json: payload });
  });
  await page.goto(`${url}/routes`);
  assert.equal(await page.locator('header.app-header').count(), 0, 'The map has no page header');
  assert.ok((await page.locator('#map').boundingBox()).height >= 990, 'Map fills the viewport');
  await page.getByRole('button', { name: 'Hide planner' }).click();
  assert.equal(await page.locator('#planner-content').isVisible(), false);
  await page.getByRole('button', { name: 'Show planner' }).click();
  await page.getByText('Connection & about', { exact: true }).click();
  for (const asset of ['/assets/app.js', '/assets/vendor/leaflet/leaflet.js', '/assets/styles.css']) {
    const response = await page.request.get(url + asset);
    assert.equal(response.status(), 200, `Built asset ${asset}`);
  }
  await page.getByText('OSRM connected · road attributes loaded').waitFor();
  assert.equal(await page.locator('.leaflet-marker-icon').count(), 3);
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.waitForTimeout(300);
  }
  tileZooms = [];
  const initialOrigin = await page.locator('#origin-lat').inputValue();
  await page.locator('.leaflet-marker-icon.origin').click();
  await page.waitForTimeout(200);
  assert.ok(tileZooms.some(zoom => zoom >= 16), 'Clicking a location zooms into street detail');
  assert.equal(await page.locator('#origin-lat').inputValue(), initialOrigin, 'Inspecting a marker does not move it');
  await page.getByRole('button', { name: 'Fit route' }).click();
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.locator('.route-option').first().waitFor();
  assert.equal(await page.locator('.route-option').count(), 2);
  assert.equal(await page.locator('.option-duration').count(), 2);
  assert.equal(await page.locator('.option-duration').first().innerText(), '40 sec');
  assert.match(await page.locator('#timing-source').innerText(), /No live traffic/);
  assert.match(await page.locator('.option-arrival').first().innerText(), /Hospital arrival \d{2}:\d{2} IST/);
  assert.match(await page.locator('.option-legs').first().innerText(), /To incident.*\nTo hospital/);
  assert.equal(requestBodies.length, 2);
  const responseBody = requestBodies.find(body => body.ambulance.latitude === 9.9312);
  const transportBody = requestBodies.find(body => body.ambulance.latitude === 9.9405);
  assert.deepEqual(responseBody.emergency, transportBody.ambulance);
  assert.equal(transportBody.emergency.latitude, Number(await page.locator('#destination-lat').inputValue()));
  assert.match(await page.locator('.option-badge').first().innerText(), /Recommended|Fastest/);
  assert.equal(await page.locator('.route-option[aria-pressed="true"] .option-selection').innerText(), 'Selected');
  assert.equal(await page.locator('.route-checks').getAttribute('open'), null);
  assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 2);
  assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#69b9f0"]').count(), 1);
  assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#929aa0"]').count(), 1);
  const oldLatitude = await page.locator('#origin-lat').inputValue();
  const routePoint = await page.locator('.leaflet-overlay-pane path[stroke="#929aa0"]').first().evaluate(path => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.2);
    const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(routePoint.x, routePoint.y);
  assert.equal(await page.locator('[data-id="trip-1-0"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#origin-lat').inputValue(), oldLatitude, 'route inspection must not place a map endpoint');
  await page.getByRole('button', { name: /Route 2/ }).click();
  assert.equal(await page.locator('[data-id="trip-1-0"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-id="trip-1-0"] .option-selection').innerText(), 'Selected');

  await page.locator('#destination-lat').fill('9.96');
  await page.locator('#destination-lat').press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('.route-option').length === 2);
  assert.ok(requestBodies.slice(-2).some(body => body.emergency.latitude === 9.96));
  await page.locator('#incident-lat').fill('9.945');
  await page.locator('#incident-lat').press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('.route-option').length === 2);
  assert.ok(requestBodies.slice(-2).some(body => body.emergency.latitude === 9.945));
  assert.ok(requestBodies.slice(-2).some(body => body.ambulance.latitude === 9.945));
  const before = requestCount;
  await page.getByRole('button', { name: 'Set A on map' }).click();
  await page.locator('#map').click({ position: { x: 420, y: 270 } });
  await page.waitForFunction(() => document.querySelectorAll('.route-option').length === 2);
  assert.ok(requestCount > before);
  const movedLatitude = Number(await page.locator('#origin-lat').inputValue());
  assert.ok(requestBodies.slice(-2).some(body => body.ambulance.latitude === movedLatitude));

  mode = 'rejected';
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.getByText(/All candidates failed/).waitFor();
  assert.equal(await page.locator('.route-option.rejected').count(), 2);
  assert.equal(await page.locator('.option-arrival').filter({ hasText: 'Hospital arrival' }).count(), 0);
  assert.match(await page.locator('.leaflet-overlay-pane path').first().getAttribute('stroke-dasharray'), /7/);

  mode = 'unavailable';
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.getByText('Local OSRM is unavailable. Start the routing service, then try again.').waitFor();
  assert.equal(await page.locator('.route-option').count(), 0);
  assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 0);

  mode = 'empty';
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.getByText(/No road route was found/).waitFor();
  assert.equal(await page.locator('.route-option').count(), 0);

  mode = 'hospital-empty';
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.getByText(/No road route was found for the hospital leg/).waitFor();
  assert.equal(await page.locator('.route-option').count(), 0, 'A response leg alone is not a complete trip');

  const previousCount = requestCount;
  await page.locator('#origin-lat').fill('91');
  await page.getByRole('button', { name: 'Find routes' }).click();
  assert.equal(requestCount, previousCount, 'invalid coordinates must not call routing');
  await page.locator('#origin-lat').fill('9.9312');

  mode = 'slow';
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.getByText('Finding road routes from local OSRM…').waitFor();
  await page.locator('#origin-lat').fill('');
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.route-option').count(), 0, 'a stale response must not redraw routes');
  await page.locator('#origin-lat').fill('9.9312');
  mode = 'success';
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.locator('.route-option').first().waitFor();

  await page.getByRole('button', { name: 'Fit route' }).click();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `No horizontal overflow at ${width}px`);
    const bounds = await page.locator('#map').boundingBox();
    const planner = await page.locator('.sidebar').boundingBox();
    assert.ok(bounds.height >= 990, 'Map remains full height at every viewport');
    if (width < 768) assert.ok(planner.height <= bounds.height * .45, 'Mobile planner leaves most of the map free');
    for (const marker of await page.locator('.leaflet-marker-icon').all()) {
      const point = await marker.boundingBox();
      assert.ok(point.x >= bounds.x && point.x + point.width <= bounds.x + bounds.width,
        `Endpoint remains visible after resizing to ${width}px`);
      assert.ok(width < 768 ? point.y + point.height < planner.y : point.x > planner.x + planner.width,
        `Route overview keeps markers clear of the planner at ${width}px`);
    }
    await page.screenshot({ path: new URL(`map-${width}.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.getByRole('button', { name: 'Find routes' }).click();
  await page.locator('.route-option').first().waitFor();
  const mobileResults = await page.locator('.route-option').first().boundingBox();
  const mobilePlanner = await page.locator('.sidebar').boundingBox();
  assert.ok(mobileResults.y >= mobilePlanner.y && mobileResults.y + mobileResults.height <= mobilePlanner.y + mobilePlanner.height,
    'Mobile results are brought into view after finding routes');
  await page.screenshot({ path: new URL('routes-mobile-results.png', output).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  await page.route('**/api/readiness', route => route.fulfill({ json: { osrm: 'unavailable', road_attributes: 'not_configured' } }));
  await page.getByRole('button', { name: 'Check again' }).click();
  await page.getByText('OSRM unavailable · start the local routing service').waitFor();
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 503, body: '' }));
  await page.reload();
  await page.getByText('Background map tiles are unavailable. Check your internet connection. Local route geometry can still be displayed.').waitFor();
  console.log('Browser checks passed: routes, selection, coordinates, map clicks, rejected paths, failures, stale requests and 4 viewport widths.');
} finally {
  await browser.close();
}

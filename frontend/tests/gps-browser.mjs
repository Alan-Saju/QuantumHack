import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { startDevServer } from '../dev-server.mjs';

const server = await startDevServer({ mode: 'mock', port: 0 });
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
try {
  // Real browser geolocation with an emulated device fix; no personal location is accessed.
  const context = await browser.newContext({ permissions: ['geolocation'],
    geolocation: { latitude: 9.942345, longitude: 76.281234, accuracy: 25 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  let lastBody;
  await page.route('**/api/emergency/route', async route => {
    lastBody = route.request().postDataJSON();
    await route.continue();
  });
  await page.goto(url);
  const destination = await page.locator('#destination-lat').inputValue();
  await page.getByRole('button', { name: 'Use my location', exact: true }).click({ timeout: 3000 });
  await page.getByText('Starting point updated. Approximate accuracy: 25 m.').waitFor();
  assert.equal(await page.locator('#origin-lat').inputValue(), '9.942345');
  assert.equal(await page.locator('#origin-lon').inputValue(), '76.281234');
  assert.equal(await page.locator('#destination-lat').inputValue(), destination);
  assert.equal(lastBody, undefined, 'First GPS fix does not submit a route automatically');
  assert.equal(await page.locator('.leaflet-marker-icon.origin').count(), 1);
  await page.getByRole('button', { name: 'Find routes', exact: true }).click();
  await page.locator('.route-option').first().waitFor();
  assert.equal(lastBody.ambulance.latitude, 9.942345);
  await context.setGeolocation({ latitude: 9.943, longitude: 76.282, accuracy: 15 });
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await page.getByText('Starting point updated. Approximate accuracy: 15 m.').waitFor();
  await page.waitForFunction(() => document.querySelector('#route-status').textContent.includes('Synthetic example routes loaded'));
  assert.equal(lastBody.ambulance.latitude, 9.943, 'GPS refresh recalculates an existing route');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../test-results/gps-location.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();

  for (const [code, text] of [[1, /Location permission denied/], [2, /Location could not be determined/], [3, /Location lookup timed out/]]) {
    const context = await browser.newContext();
    await context.addInitScript(code => {
      window.locationCalls = 0;
      Object.defineProperty(navigator, 'geolocation', { value: {
        getCurrentPosition(success, failure) { window.locationCalls++; failure({ code }); },
      } });
    }, code);
    const page = await context.newPage();
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(url);
    assert.equal(await page.evaluate(() => window.locationCalls), 0, 'Location is requested only after a click');
    const original = await page.locator('#origin-lat').inputValue();
    await page.getByRole('button', { name: 'Use my location', exact: true }).click();
    await page.locator('#location-status').filter({ hasText: text }).waitFor();
    assert.equal(await page.locator('#origin-lat').inputValue(), original);
    assert.equal(await page.getByRole('button', { name: 'Use my location', exact: true }).isEnabled(), true);
    await context.close();
  }

  const stale = await browser.newContext();
  await stale.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(success) { window.deliverLocation = () => success({ coords: { latitude: 10, longitude: 77, accuracy: 10 } }); },
    } });
  });
  const stalePage = await stale.newPage();
  await stalePage.route('https://tile.openstreetmap.org/**', route => route.abort());
  await stalePage.goto(url);
  await stalePage.getByRole('button', { name: 'Use my location', exact: true }).click();
  await stalePage.getByRole('button', { name: 'Finding location…', exact: true }).waitFor();
  await stalePage.locator('#origin-lat').fill('9.94');
  await stalePage.evaluate(() => window.deliverLocation());
  await stalePage.getByText('Locations changed during lookup. Click Use my location to try again.').waitFor();
  assert.equal(await stalePage.locator('#origin-lat').inputValue(), '9.94');
  await stale.close();
  for (const variant of ['unsupported', 'invalid']) {
    const context = await browser.newContext();
    await context.addInitScript(variant => {
      Object.defineProperty(navigator, 'geolocation', { value: variant === 'unsupported' ? undefined : {
        getCurrentPosition(success) { success({ coords: { latitude: 91, longitude: 76, accuracy: 5 } }); },
      } });
    }, variant);
    const page = await context.newPage();
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(url);
    const original = await page.locator('#origin-lat').inputValue();
    await page.getByRole('button', { name: 'Use my location', exact: true }).click();
    await page.locator('#location-status[data-state="error"]').waitFor();
    assert.equal(await page.locator('#origin-lat').inputValue(), original);
    await context.close();
  }
  console.log('GPS browser checks passed: permission-based fix, route refresh, errors, manual edits and responsive layout.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

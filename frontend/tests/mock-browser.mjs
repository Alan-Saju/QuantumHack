import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startDevServer } from '../dev-server.mjs';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
try {
  for (const scenario of ['success', 'no-route', 'rejected', 'service-failure']) {
    const server = await startDevServer({ mode: 'mock', scenario, port: 0 });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
        contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=', 'base64'),
      }));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByText('Connection & about', { exact: true }).click();
      await page.getByText('Synthetic demo data · no routing service connected').waitFor();
      await page.getByRole('button', { name: 'Find routes' }).click();
      const expected = { success: /Synthetic example routes loaded/, 'no-route': /No road route was found/,
        rejected: /All candidates failed/, 'service-failure': /Local OSRM is unavailable/ };
      await page.locator('#route-status').filter({ hasText: expected[scenario] }).waitFor();
      assert.equal(await page.locator('.route-option').count(), ['success', 'rejected'].includes(scenario) ? 2 : 0);
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.locator('.demo-banner').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.locator('.app-footer').scrollIntoViewIfNeeded();
        assert.ok((await page.locator('.demo-banner').boundingBox()).y >= 0, 'Demo label remains visible after scrolling');
      }
      assert.deepEqual(errors, []);
      if (scenario === 'success') await page.screenshot({ path: new URL('../test-results/mock-mode.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
    } finally {
      await page.close();
      await new Promise(resolve => server.close(resolve));
    }
  }
  // Exercise the actual live runner, without browser interception or a backend.
  const server = await startDevServer({ port: 0, backendTarget: 'http://127.0.0.1:1' });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/routes`);
    await page.getByText('Map configuration could not be loaded. Restart the app and try again.').waitFor();
    assert.equal(await page.locator('.demo-banner').count(), 0);
    assert.equal(await page.locator('.route-option').count(), 0);
  } finally {
    await page.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Mock browser checks passed: all four shared fixtures, persistent labels, responsive layout and live failure without fallback.');
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { startDevServer } from '../dev-server.mjs';

async function server(t, options = {}) {
  const instance = await startDevServer({ port: 0, ...options });
  t.after(() => new Promise(resolve => instance.close(resolve)));
  return `http://127.0.0.1:${instance.address().port}`;
}

for (const name of ['success', 'no-route', 'rejected', 'service-failure']) {
  test(`mock mode serves shared ${name} fixture and labels the page`, async t => {
    const url = await server(t, { mode: 'mock', scenario: name });
    const fixture = JSON.parse(await readFile(new URL(`../../contracts/fixtures/${name}.json`, import.meta.url)));
    const response = await fetch(`${url}${fixture.path}`, { method: 'POST', body: JSON.stringify(fixture.request) });
    assert.equal(response.status, fixture.status_code);
    assert.deepEqual(await response.json(), fixture.response);
    assert.match(await (await fetch(url)).text(), /Synthetic demo data/);
    assert.equal((await (await fetch(`${url}/api/readiness`)).json()).osrm, 'unavailable');
    assert.equal((await fetch(`${url}/api/missing`)).status, 404);
    assert.equal((await fetch(`${url}${fixture.path}`)).status, 405);
    assert.equal((await fetch(`${url}/assets/app.js`)).status, 200);
    assert.equal((await fetch(`${url}/assets/vendor/leaflet/leaflet.js`)).status, 200);
  });
}

test('live mode forwards method, query, body, status and content type', async t => {
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.writeHead(422, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, path: req.url, body }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const url = await server(t, { backendTarget: `http://127.0.0.1:${upstream.address().port}` });
  const response = await fetch(`${url}/api/example?q=one`, { method: 'POST', body: '{"value":1}' });
  assert.equal(response.status, 422);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { method: 'POST', path: '/api/example?q=one', body: '{"value":1}' });
  assert.doesNotMatch(await (await fetch(url)).text(), /Synthetic demo data/);
});

test('live mode reports an unavailable backend without fixtures', async t => {
  const url = await server(t, { backendTarget: 'http://127.0.0.1:1' });
  const response = await fetch(`${url}/api/emergency/route`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'BACKEND_UNAVAILABLE');
});

test('static access rejects traversal, encoded separators and private files', async t => {
  const url = await server(t, { mode: 'mock' });
  for (const pathname of ['/assets/%2e%2e%2fpackage.json', '/assets/..%5cpackage.json', '/assets/%00', '/package.json', '/assets/.build-complete']) {
    const response = await fetch(url + pathname);
    assert.ok([400, 403, 404].includes(response.status), pathname);
  }
});

test('invalid modes, scenarios, ports and remote targets fail at startup', async () => {
  for (const options of [{ mode: 'typo' }, { mode: 'mock', scenario: '../success' }, { port: -1 }, { backendTarget: 'https://example.com' }]) {
    await assert.rejects(startDevServer(options));
  }
});

test('CLI honors PORT and MOCK_SCENARIO without a Python server', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, [new URL('../dev-server.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--mock'], {
    windowsHide: true, env: { ...process.env, PORT: '0', MOCK_SCENARIO: 'rejected' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  });
  const url = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stderr.on('data', chunk => reject(new Error(String(chunk))));
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    child.once('exit', code => reject(new Error(`Runner exited: ${code}`)));
  });
  const fixture = JSON.parse(await readFile(new URL('../../contracts/fixtures/rejected.json', import.meta.url)));
  const response = await fetch(`${url}${fixture.path}`, { method: 'POST', body: JSON.stringify(fixture.request) });
  assert.deepEqual(await response.json(), fixture.response);
});

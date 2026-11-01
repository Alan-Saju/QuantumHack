// Loopback-only frontend runner. Fixtures are available only in explicit mock mode.
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const scenarios = ['success', 'no-route', 'rejected', 'service-failure'];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const inside = (base, file) => { const relative = path.relative(base, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

export async function startDevServer({ mode = 'live', scenario = 'success', port = 5173,
  backendTarget = 'http://127.0.0.1:8000', built = false } = {}) {
  if (!['mock', 'live'].includes(mode)) throw new Error('Mode must be mock or live');
  if (!scenarios.includes(scenario)) throw new Error('Unknown mock scenario');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid frontend port');
  const target = new URL(backendTarget);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('BACKEND_TARGET must be a loopback HTTP origin');
  }
  const assets = await realpath(path.join(root, built ? 'dist' : 'src'));
  const vendor = await realpath(path.join(root, built ? 'dist/vendor/leaflet' : 'node_modules/leaflet/dist'));
  const fixture = mode === 'mock' ? JSON.parse(await readFile(path.join(root, `../contracts/fixtures/${scenario}.json`), 'utf8')) : null;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Decode before normalization so encoded traversal cannot become a static path.
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) {
        return json(res, 403, { error: { code: 'FORBIDDEN_PATH', message: 'Path is not served.' } });
      }
      if (pathname.startsWith('/api/')) {
        if (mode === 'live') {
          const headers = {};
          for (const name of ['content-type', 'accept']) if (req.headers[name]) headers[name] = req.headers[name];
          const upstream = http.request(new URL(req.url, target), { method: req.method, headers }, response => {
            res.writeHead(response.statusCode, { 'content-type': response.headers['content-type'] ?? 'application/json' });
            response.on('error', () => res.destroy());
            response.pipe(res);
          });
          upstream.setTimeout(20000, () => upstream.destroy(new Error('Backend timeout')));
          upstream.on('error', () => {
            if (!res.headersSent) json(res, 503, { error: { code: 'BACKEND_UNAVAILABLE', message: 'Cannot reach the configured local backend. Start it and try again.' } });
            else res.destroy();
          });
          res.on('close', () => upstream.destroy());
          req.pipe(upstream);
          return;
        }
        if (pathname === '/api/map-config' && req.method === 'GET') return json(res, 200, {
          tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', tile_attribution: '© OpenStreetMap contributors',
        });
        if (pathname === '/api/readiness' && req.method === 'GET') return json(res, 200, {
          osrm: 'unavailable', road_attributes: 'not_configured', probe: 'Synthetic demo data; no OSRM probe was performed.',
        });
        if (pathname === fixture.path) {
          if (req.method !== fixture.method) return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
          req.resume();
          return json(res, fixture.status_code, fixture.response);
        }
        return json(res, 404, { error: { code: 'NOT_FOUND', message: 'No mock endpoint exists.' } });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or HEAD.' } });
      let base = assets;
      let relative;
      if (pathname === '/') relative = mode === 'mock' ? 'index.html' : 'allocation.html';
      else if (pathname === '/routes') relative = 'index.html';
      else if (pathname.startsWith('/assets/vendor/leaflet/')) { base = vendor; relative = pathname.slice('/assets/vendor/leaflet/'.length); }
      else if (pathname.startsWith('/assets/')) relative = pathname.slice('/assets/'.length);
      else return json(res, 404, { error: { code: 'NOT_FOUND', message: 'File not found.' } });
      const file = await realpath(path.resolve(base, relative));
      if (!inside(base, file)) return json(res, 403, { error: { code: 'FORBIDDEN_PATH', message: 'Path is not served.' } });
      let content = await readFile(file);
      if (pathname === '/' && mode === 'mock') content = Buffer.from(content.toString().replace('<body>', '<body data-mode="mock"><div class="demo-banner" role="status">Synthetic demo data · fixed example routes</div>'));
      res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      json(res, error instanceof URIError ? 400 : 404, { error: { code: 'NOT_FOUND', message: 'File not found.' } });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startDevServer({ mode: process.argv.includes('--mock') ? 'mock' : 'live',
    scenario: process.env.MOCK_SCENARIO ?? 'success', port: Number(process.env.PORT ?? 5173),
    backendTarget: process.env.BACKEND_TARGET ?? 'http://127.0.0.1:8000' });
  console.log(`Frontend ${process.argv.includes('--mock') ? 'mock (Synthetic demo data)' : 'live'}: http://127.0.0.1:${server.address().port}`);
}

// Start a temporary real FastAPI app, verify built assets, then test the Node-only runner.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const localPython = fileURLToPath(new URL(process.platform === 'win32' ? '../../qiskit-env/Scripts/python.exe' : '../../qiskit-env/bin/python', import.meta.url));
const python = process.env.PYTHON ?? (existsSync(localPython) ? localPython : 'python');
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
const backend = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '0', '--no-use-colors'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, ROAD_INDEX_PATH: '', MAP_TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
});
try {
  const url = await new Promise((resolve, reject) => {
    let logs = '';
    const timer = setTimeout(() => reject(new Error(`Test backend startup timed out: ${logs}`)), 20000);
    const fail = error => { clearTimeout(timer); reject(error); };
    backend.once('error', fail);
    backend.once('exit', code => fail(new Error(`Test backend exited (${code}): ${logs}`)));
    backend.stderr.on('data', chunk => {
      logs += chunk;
      const match = logs.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  for (const script of ['browser.mjs', 'mock-browser.mjs', 'gps-browser.mjs']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
        cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, APP_URL: url },
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)));
    });
  }
} finally {
  if (backend.exitCode === null) {
    const exited = new Promise(resolve => backend.once('exit', resolve));
    backend.kill();
    await exited;
  }
}

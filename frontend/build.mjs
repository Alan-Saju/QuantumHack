import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'src'), dist, { recursive: true });
await cp(path.join(root, 'node_modules/leaflet/dist'), path.join(dist, 'vendor/leaflet'), { recursive: true });
await cp(path.join(root, 'node_modules/leaflet/LICENSE'), path.join(dist, 'vendor/leaflet/LICENSE'));
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('id="map"')) throw new Error('Map entry point is missing');
await writeFile(path.join(dist, '.build-complete'), 'Leaflet 1.9.4\n');
console.log('Built local map at frontend/dist. Start FastAPI and open http://127.0.0.1:8000/');

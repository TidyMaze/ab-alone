// node render.mjs <outdir> job...   job = view:A:arena-low | mesh3d:A:cell | mesh2d:A:cell | scene2d:A:arena
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire('/Users/yann.rolland/perso/ab-alone/client/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)), three = '/Users/yann.rolland/perso/ab-alone/client/node_modules/three';
const types = { '.js': 'text/javascript', '.html': 'text/html' };
const srv = http.createServer((q, s) => {
  const u = q.url.split('?')[0], f = u === '/' ? here + '/index.html' : u.startsWith('/three/') ? three + u.slice(6) : u.startsWith('/m/') ? here + u.slice(2) : null;
  if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(s);
}).listen(0);
const port = srv.address().port, [out, ...jobs] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
for (const j of jobs) {
  const t0 = Date.now(), [k, dir, id] = j.split(':');
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('ERR', j, e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('CON', j, m.text().slice(0, 200)); });
  await p.goto(`http://localhost:${port}/`); await p.waitForFunction('window.ready===true', null, { timeout: 60000 });
  const fn = { view: 'renderView', mesh3d: 'renderMesh3D', mesh2d: 'renderMesh2D', scene2d: 'renderScene2D' }[k];
  const size = await p.evaluate(([f, d, i]) => window[f](d, i), [fn, dir, id]);
  await p.waitForTimeout(150);
  const css = k.startsWith('mesh') ? 0.5 : 1;
  await p.setViewportSize({ width: Math.ceil(size[0] * css) + 2, height: Math.ceil(size[1] * css) + 2 });
  const el = k.startsWith('mesh') ? '#sheet canvas' : '#root';
  if (k.startsWith('mesh')) await p.evaluate(([w, h]) => { const c = document.querySelector('#sheet canvas'); c.style.width = w + 'px'; c.style.height = h + 'px'; }, [size[0] / 2, size[1] / 2]);
  await p.locator(el).screenshot({ path: `${out}/${dir}-${id}${k.startsWith('mesh') ? '-' + k.slice(4) : k === 'scene2d' ? '-2d' : ''}.jpg`, type: 'jpeg', quality: 86 });
  console.log(j, Date.now() - t0, 'ms'); await p.close();
}
await b.close(); srv.close();

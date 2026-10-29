// Dev-only Vite plugin of the ?lights panel's Save button (#875): the panel POSTs its values to /__sceneoverrides and this
// writes them to src/sceneoverrides.json, which the game applies at boot (main.ts). It only serves in `vite dev`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../src/sceneoverrides.json', import.meta.url));

/** The file's text for a request body: pretty printed, the names sorted so a diff only shows what moved. Throws if `power` is not name -> number. */
export function overridesText(body) {
  const power = body?.power;
  if (!power || typeof power !== 'object' || !Object.values(power).every((v) => typeof v === 'number')) throw new Error('power must map names to numbers');
  const sorted = Object.fromEntries(Object.entries(power).sort(([a], [b]) => (a < b ? -1 : 1)));
  return `${JSON.stringify({ power: sorted }, null, 2)}\n`;
}

export function sceneOverrides(file = FILE) {
  return {
    name: 'scene-overrides',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sceneoverrides', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            writeFileSync(file, overridesText(JSON.parse(body)));
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

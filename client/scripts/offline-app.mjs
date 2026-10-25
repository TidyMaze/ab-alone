// Vite plugin of the offline app (#193). After the production build it writes sw.js next to index.html: src/sw.ts
// bundled as a classic script, with the URL of every built file to precache (hashed JS, CSS and wasm, the textures,
// the icons, the manifest, the page), a cache name hashed from their content, and the Google Fonts stylesheets the
// page links to (#221). Not in the dev server.
// Plain Node, no dependency. The pure parts are in src/offline.ts. offline-app.test.ts checks the build it starts,
// e2e/offline.spec.ts the whole step.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { build } from 'vite';
import { cacheName, fontStylesheets, precacheFiles, precacheUrl } from '../src/offline.ts';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function offlineApp() {
  let root = '';
  let outDir = '';
  let base = '/';
  return {
    name: 'offline-app',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
      base = config.base;
    },
    async closeBundle(error) {
      if (error) return;
      const built = readdirSync(outDir, { recursive: true })
        .map((f) => String(f).split(sep).join('/'))
        .filter((f) => statSync(join(outDir, f)).isFile());
      const files = precacheFiles(built);
      const name = cacheName(Object.fromEntries(files.map((f) => [f, sha256(readFileSync(join(outDir, f)))])), sha256);
      await build({
        configFile: false,
        root,
        base,
        publicDir: false,
        logLevel: 'warn',
        define: {
          __PRECACHE__: JSON.stringify(files.map((f) => precacheUrl(f, base))),
          __CACHE_NAME__: JSON.stringify(name),
          __FONT_STYLESHEETS__: JSON.stringify(fontStylesheets(readFileSync(join(outDir, 'index.html'), 'utf8'))),
        },
        build: {
          outDir,
          emptyOutDir: false,
          lib: { entry: join(root, 'src/sw.ts'), formats: ['iife'], name: 'sw', fileName: () => 'sw.js' },
        },
      });
    },
  };
}

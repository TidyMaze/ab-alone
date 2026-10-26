import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
// @ts-expect-error plain Node script, no type declarations (the client has no Node types)
import { ktx2Textures } from './scripts/ktx2-textures.mjs';
// @ts-expect-error plain Node script, no type declarations (the client has no Node types)
import { offlineApp } from './scripts/offline-app.mjs';

export default defineConfig(({ command, mode, isPreview }) => ({
  // The production build is served by GitHub Pages under /ab-alone/, and so is its preview (the offline e2e test).
  // Dev and e2e stay at /.
  base: command === 'build' || isPreview ? '/ab-alone/' : '/',
  // The commit the page was built from, for the Copy diagnostics export (#220). GitHub Actions sets GITHUB_SHA.
  define: { __BUILD__: JSON.stringify((loadEnv(mode, '.', '').GITHUB_SHA ?? 'dev').slice(0, 12)) },
  resolve: {
    alias: {
      'abalone-wasm': new URL('../crates/abalone-wasm/pkg/abalone_wasm.js', import.meta.url).pathname,
    },
  },
  server: {
    // The wasm package is built outside client/, the dev server must be allowed to serve it.
    fs: { allow: ['..'] },
    // The e2e dev server (--mode e2e, playwright.config.ts) does not watch files, so it never reloads a page under
    // test. Every `bun run dev` rebuilds the wasm package: a watching server reloaded the pages of a run in progress
    // when a second run, a dev server or a wasm build started in the same checkout (bug #185).
    watch: mode === 'e2e' ? null : undefined,
  },
  // The bot worker imports the wasm package with top-level await: it needs ES module output.
  worker: { format: 'es' },
  // The textures ship as KTX2, encoded from client/textures/ (scripts/ktx2-textures.mjs, #700).
  // The production build also writes sw.js, the service worker of the offline app (#193).
  // The e2e dev server serves the page without its Google Fonts links, the text falls back to the system fonts: the
  // stylesheet holds the load event that page.goto waits for, and during a network outage every test of the run timed
  // out (bug #585). The production build and its preview (the offline spec) keep them.
  plugins: [
    ktx2Textures(),
    offlineApp(),
    ...(mode === 'e2e'
      ? [
          {
            name: 'no-remote-fonts',
            transformIndexHtml: (html: string) => html.replace(/\s*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, ''),
          },
        ]
      : []),
  ],
  test: {
    css: true, // hud.test reads ui.css as raw text, vitest empties css files by default
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // A main.ts test boots the whole page on the jsdom harness (src/test/), a reload two: on a loaded machine, and the
    // first boot cold, that takes more than the default 5 s.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // Every source file is unit tested (decision #445), main.ts included on the jsdom harness in src/test/, which is
      // test code itself.
      include: ['src/**/*.ts', 'scripts/**/*.{ts,mjs}'],
      exclude: ['**/*.test.ts', 'src/test/**'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
}));

import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  // The production build is served by GitHub Pages under /ab-alone/. Dev and e2e stay at /.
  base: command === 'build' ? '/ab-alone/' : '/',
  resolve: {
    alias: {
      'abalone-wasm': new URL('../crates/abalone-wasm/pkg/abalone_wasm.js', import.meta.url).pathname,
    },
  },
  // The wasm package is built outside client/, the dev server must be allowed to serve it.
  server: { fs: { allow: ['..'] } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only the pure game-board logic is unit tested here. The Three.js scene and the DOM wiring
      // in main.ts and scene.ts need a real browser (Playwright e2e, a later task).
      include: ['src/board.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
}));

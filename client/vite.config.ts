import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'abalone-wasm': new URL('../crates/abalone-wasm/pkg/abalone_wasm.js', import.meta.url).pathname,
    },
  },
  // The wasm package is built outside client/, the dev server must be allowed to serve it.
  server: { fs: { allow: ['..'] } },
  test: {
    coverage: {
      provider: 'v8',
      // Only the pure game-board logic is unit tested here. The Three.js scene and the DOM wiring
      // in main.ts and scene.ts need a real browser (Playwright e2e, a later task).
      include: ['src/board.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

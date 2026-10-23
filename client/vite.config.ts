import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'abalone-wasm': fileURLToPath(
        new URL('../crates/abalone-wasm/pkg/abalone_wasm.js', import.meta.url),
      ),
    },
  },
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

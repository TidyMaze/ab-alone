import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The client's Open world save (client/src/openworldsave.ts) loads abalone-wasm: the tests give it the Node build, so a save the
  // client writes is read here and the other way round.
  resolve: { alias: { 'abalone-wasm': new URL('./engine/abalone_wasm.js', import.meta.url).pathname } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts is the stdio entry point, three lines of wiring: the e2e run starts it as a real process
      // (e2e/game.spec.ts), where unit coverage cannot reach.
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

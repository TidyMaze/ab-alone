import { defineConfig } from 'vitest/config';

// The e2e run starts the server as a real process and plays a full game over stdio.
export default defineConfig({
  test: {
    include: ['e2e/**/*.spec.ts'],
    testTimeout: 180_000,
  },
});

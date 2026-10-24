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
  // The bot worker imports the wasm package with top-level await: it needs ES module output.
  worker: { format: 'es' },
  test: {
    css: true, // hud.test reads ui.css as raw text, vitest empties css files by default
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only the pure game-board and bot-protocol logic is unit tested here. The Three.js scene and the DOM wiring
      // in main.ts and scene.ts need a real browser (Playwright e2e, a later task).
      include: ['src/board.ts', 'src/bot.ts', 'src/ghost.ts', 'src/score.ts', 'src/hud.ts', 'src/quality.ts', 'src/eject.ts',
        'src/moverecord.ts', 'src/movelog.ts', 'src/transport.ts', 'src/invite.ts', 'src/session.ts', 'src/camera.ts', 'src/seats.ts', 'src/bosshud.ts',
        'src/presence.ts', 'src/hull.ts', 'src/chaplain.ts', 'src/choir.ts', 'src/rematch.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
}));

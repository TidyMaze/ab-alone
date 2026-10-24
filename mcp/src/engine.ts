// Loads the Node build of abalone-wasm (`bun run wasm`, in engine/), the only judge of the game.
import { createRequire } from 'node:module';
import type { EngineLike } from './game';

type Wasm = typeof import('../engine/abalone_wasm');

// The Node build is CommonJS: it is required, so Bun and vitest load it the same way.
const wasm = createRequire(import.meta.url)('../engine/abalone_wasm.js') as Wasm;

/** A new game in the engine: standard layout, Black to move. */
export function newEngine(): EngineLike {
  return new wasm.Engine();
}

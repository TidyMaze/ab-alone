// Loads the Node build of abalone-wasm (`bun run wasm`, in engine/), the only judge of the game.
import { createRequire } from 'node:module';
import type { EncounterLike, EngineLike } from './game';

type Wasm = typeof import('../engine/abalone_wasm');

// The Node build is CommonJS: it is required, so Bun and vitest load it the same way.
const wasm = createRequire(import.meta.url)('../engine/abalone_wasm.js') as Wasm;

/** A new game in the engine: standard layout, Black to move. */
export function newEngine(): EngineLike {
  return new wasm.Engine();
}

/** A new fight against boss `boss`, the agent is Black. Throws the engine's reason for an unknown id. */
export function newEncounter(boss: string, seed: number): EncounterLike {
  return new wasm.Encounter(boss, seed);
}

/** The boss ids of the engine, in play order. */
export function bossIds(): string[] {
  return wasm.boss_ids();
}

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

/** A new fight against boss `boss`, the agent is Black. Throws the engine's reason for an id not in `bossIds()`. */
export function newEncounter(boss: string, seed: number): EncounterLike {
  if (!bossIds().includes(boss)) throw `unknown boss ${boss}`; // the engine's words, The Ballast Mind too (#572)
  return new wasm.Encounter(boss, seed);
}

/** The engine version a room's Hello carries: peers on another one refuse to play (docs/specs/tech.md section 9). */
export function engineVersion(): number {
  return wasm.engine_version();
}

/** The boss ids of the engine, in play order. The Ballast Mind stays out: the board text knows only the 61 cells of
 * radius 4, not its radius 5 board (#572). */
export function bossIds(): string[] {
  return wasm.boss_ids().filter((id) => id !== 'ballast');
}

// Loads the Node build of edgefall-wasm (`bun run wasm`, in engine/), the only judge of the game.
import { createRequire } from 'node:module';
import { encounterFor, engineFor } from '../../client/src/bot';
import type { EncounterLike, EngineLike } from './game';
import type { RunRules } from './run';
import type { WorldRules } from './world';

type Wasm = typeof import('../engine/edgefall_wasm');

// The Node build is CommonJS: it is required, so Bun and vitest load it the same way.
const wasm = createRequire(import.meta.url)('../engine/edgefall_wasm.js') as Wasm;

/** A new game in the engine: standard layout, Black to move. */
export function newEngine(): EngineLike {
  return new wasm.Engine();
}

/** A new fight against boss `boss`, the agent is Black. Throws the engine's reason for an unknown id. */
export function newEncounter(boss: string, seed: number): EncounterLike {
  return new wasm.Encounter(boss, seed);
}

/** The engine version a room's Hello carries: peers on another one refuse to play (docs/specs/tech.md section 9). */
export function engineVersion(): number {
  return wasm.engine_version();
}

/** The boss ids of the engine, in play order. */
export function bossIds(): string[] {
  return wasm.boss_ids();
}

/** The Open world rules of the engine (docs/specs/openworld.md): the map, the enemies, the lairs, the teleporters, the walk, the
 * step, the troop's push and the world version of a save. */
export function worldRules(): WorldRules {
  return {
    world_chunk: wasm.world_chunk,
    world_enemies: wasm.world_enemies,
    world_lairs: wasm.world_lairs,
    world_teleporters: wasm.world_teleporters,
    world_pads: wasm.world_pads,
    world_path: wasm.world_path,
    world_enter: wasm.world_enter,
    world_flock: wasm.world_flock,
    world_version: wasm.world_version,
    WorldFight: wasm.WorldFight,
  };
}

/** The rogue-lite rules of the engine (docs/specs/roguelite.md): the map, the bot's army and the exits of a run seed, the army's fight as the
 * client stands it (`engineFor` of client/src/bot.ts, the one the bot's worker uses too) and an act boss at its act's strength, with the army's build when it takes it (`encounterFor`). */
export function runRules(): RunRules {
  return {
    run_map: wasm.run_map,
    run_foes: wasm.run_foes,
    run_exits: wasm.run_exits,
    fight: (army, foes, placed, relics) => engineFor(wasm.Engine, army, placed, foes, undefined, relics),
    boss: (id, seed, percent, placed, relics) => {
      const boss = encounterFor(wasm.Encounter, id, seed, placed, relics); // the army's build, when the boss takes it (#1494)
      boss.scale_node_budget(percent);
      return boss;
    },
  };
}

// The hero's step of the Open world (docs/specs/openworld.md section 4): the held arrows, the camera's yaw and the cells the hero
// can enter go to the bridge's `world_step` (abalone-core `worldstep`), which holds the rule; this module only packs them.
import { world_enter, world_step, world_trail } from 'abalone-wasm';
import { DIRECTIONS, type Axial } from './board';
import type { FightState } from './openworldfight';
import { TERRAINS, type World } from './openworld';

/** The bit of each arrow key in the bridge's `keys` argument. */
const BITS: Readonly<Record<string, number>> = { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8 };

/** The cell the hero steps to from `at` with the arrows `held`, in the camera's `yaw` (radians): the cell of the straight step, or with
 * `steering` the free one round an obstacle (#1137); `null` for no arrow or for opposite arrows. `free` tells whether the hero can
 * enter a cell, asked only when the step is steered. */
export function heroStep(at: Axial, held: Iterable<string>, yaw: number, steering: boolean, free: (cell: Axial) => boolean): Axial | null {
  let keys = 0;
  for (const key of held) keys |= BITS[key] ?? 0;
  let mask = 0;
  if (steering) DIRECTIONS.forEach(([dq, dr], i) => (mask |= Number(free([at[0] + dq, at[1] + dr])) << i));
  const dir = world_step(at[1], keys, yaw, steering, mask);
  return dir < 0 ? null : [at[0] + DIRECTIONS[dir]![0], at[1] + DIRECTIONS[dir]![1]];
}

/** What a step onto a cell does: it is `refused`, the hero `rolls` onto it, or it `breaks` the obstacle there (#1147). */
export type Entry = 'refused' | 'rolls' | 'breaks';
const ENTRIES: readonly Entry[] = ['refused', 'rolls', 'breaks'];

/** What the step of the hero from `at` to `to` does (`world_enter`, abalone-core `worldstep`): the rule is in the engine; this reads the
 * terrain of the cell, whether an enemy stands on it and, for a tree, whether another tree stands beside it. */
export function enter(world: World, fight: FightState, at: Axial, to: Axial): Entry {
  const terrain = world.tile(to[0], to[1])?.terrain;
  const trees = terrain === 'tree' && DIRECTIONS.some(([dq, dr]) => world.tile(to[0] + dq, to[1] + dr)?.terrain === 'tree');
  const occupied = fight.occupied(world, to[0], to[1]);
  return ENTRIES[world_enter(at[0], at[1], to[0], to[1], terrain === undefined ? -1 : TERRAINS.indexOf(terrain), occupied, trees)]!;
}

/** The troop after the hero steps from `at` to `to` (`world_trail`): the cell it left first, then the marbles before, none on `to`. */
export function trail(troop: readonly Axial[], at: Axial, to: Axial): Axial[] {
  const flat = world_trail(Int32Array.from(troop.flat()), at[0], at[1], to[0], to[1]);
  return Array.from({ length: flat.length / 2 }, (_, i): Axial => [flat[2 * i]!, flat[2 * i + 1]!]);
}

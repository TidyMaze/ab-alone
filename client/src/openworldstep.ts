// The hero's step of the Open world (docs/specs/openworld.md section 4): the held arrows, the camera's yaw and the cells the hero
// can enter go to the bridge's `world_step` (abalone-core `worldstep`), which holds the rule; this module only packs them.
import { world_step } from 'abalone-wasm';
import { DIRECTIONS, type Axial } from './board';

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

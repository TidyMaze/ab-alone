// The Ballast Mind (docs/specs/game-design.md section 7.5, #749): every 3 turns it borrows one effect of another boss.
// The HUD line names it one turn ahead, and again once it has fired (#838); the effect itself then shows with the tell
// of its own boss, and a ring on each cell it touched.
import type { Axial } from './board';

/** The bosses' effects `Encounter.ballast_next()` codes, in the order of the bridge. */
const EFFECTS = ["the Hull's crack", "the Pulsar's pulse", "the Magnetizer's polarity", "the Chaplain's conversion check", "the Swarm's wave"];

/** HUD line of the effect borrowed next turn, '' when none is due (`ballast_next()` is -1). */
export function ballastText(code: number): string {
  const effect = EFFECTS[code];
  return effect ? `Next turn: ${effect}` : '';
}

/** The effect the last ply borrowed and the cells it touched, from `Encounter.ballast_fired()`. */
export interface Fired {
  effect: number;
  cells: Axial[];
}

/** Splits the bridge's `[code, q, r, q, r...]`, `null` when the last ply borrowed nothing. */
export function parseFired(flat: ArrayLike<number>): Fired | null {
  if (flat.length === 0) return null;
  if (flat.length % 2 !== 1) throw new Error(`fired array length ${flat.length} is not odd`);
  const cells: Axial[] = [];
  for (let i = 1; i < flat.length; i += 2) cells.push([flat[i]!, flat[i + 1]!]);
  return { effect: flat[0]!, cells };
}

/** HUD line of the effect that just fired, '' when the last ply borrowed none. */
export function firedText(fired: Fired | null): string {
  return fired ? `Fired: ${EFFECTS[fired.effect]}` : '';
}

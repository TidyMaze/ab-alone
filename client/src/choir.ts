// The Choir tell (docs/specs/game-design.md section 7.2): three boss armies take turns in a fixed
// cycle and the army that moves next is marked. Pure helpers over the bridge's `armies()` records
// and `next_army()` code, the board drawing lives in main.ts.
import type { Axial } from './board';

const ARMY_STRIDE = 3;
/** Army names by bridge code, the order of the cycle. */
export const ARMY_NAMES = ['Alto', 'Tenor', 'Bass'] as const;

export interface Member {
  cell: Axial;
  army: number; // index in ARMY_NAMES
}

/** Splits the flat `[q, r, army]` records of `Encounter.armies()`. */
export function parseArmies(flat: ArrayLike<number>): Member[] {
  if (flat.length % ARMY_STRIDE !== 0) {
    throw new Error(`army array length ${flat.length} is not a multiple of ${ARMY_STRIDE}`);
  }
  const members: Member[] = [];
  for (let i = 0; i < flat.length; i += ARMY_STRIDE) {
    members.push({ cell: [flat[i]!, flat[i + 1]!], army: flat[i + 2]! });
  }
  return members;
}

/** HUD fallback of the tell, '' when no army is in turn (another boss, or the fight is over). */
export function choirText(next: number): string {
  const name = ARMY_NAMES[next];
  return name ? `Next army: ${name}` : '';
}

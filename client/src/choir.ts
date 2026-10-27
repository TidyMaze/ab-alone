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

/** The armies that still have a marble, from the bridge's `armies()` records. */
export function armiesLeft(members: readonly Member[]): number {
  return new Set(members.map((m) => m.army)).size;
}

/** HUD fallback of the tell, '' when no army is in turn (another boss, or the fight is over). `left` armies are
 * still singing: two after the first removal, and the last one plays two moves a boss turn. */
export function choirText(next: number, left: number): string {
  const name = ARMY_NAMES[next];
  if (!name) return '';
  if (left === 1) return `Last army: ${name}, two moves a turn`;
  return left === 2 ? `Next army: ${name} · 2 armies left` : `Next army: ${name}`;
}

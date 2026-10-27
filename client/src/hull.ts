// The Hull tell (docs/specs/game-design.md section 7.1): one cell cracks, ticks for 2 player turns, then
// vanish. Pure helpers over the bridge's `cracks()` records, the board drawing lives in main.ts.
import { cellIndex, type Axial } from './board';

const CRACK_STRIDE = 3;
/** Spacing of the engraved ticks on a cracked disc, in board units. */
const TICK_GAP = 0.2;

export interface Crack {
  cell: Axial;
  left: number; // player turns before the cell vanishes
}

/** Splits the flat `[q, r, turns_left]` records of `Encounter.cracks()`. */
export function parseCracks(flat: ArrayLike<number>): Crack[] {
  if (flat.length % CRACK_STRIDE !== 0) {
    throw new Error(`crack array length ${flat.length} is not a multiple of ${CRACK_STRIDE}`);
  }
  const cracks: Crack[] = [];
  for (let i = 0; i < flat.length; i += CRACK_STRIDE) {
    cracks.push({ cell: [flat[i]!, flat[i + 1]!], left: flat[i + 2]! });
  }
  return cracks;
}

/** Turns left by board index, for the cells that are cracked; `cells` is the board's cell order (the arena's, #503). */
export function crackLeft(cracks: readonly Crack[], cells?: readonly Axial[]): Map<number, number> {
  return new Map(cracks.map((c) => [cellIndex(c.cell[0], c.cell[1], cells), c.left]));
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** HUD fallback of the tell, '' without cracks: "Cracks: 1 cell in 1 turn · 2 cells in 2 turns". */
export function crackText(cracks: readonly Crack[]): string {
  if (cracks.length === 0) return '';
  const byLeft = new Map<number, number>();
  for (const c of cracks) byLeft.set(c.left, (byLeft.get(c.left) ?? 0) + 1);
  const parts = [...byLeft.entries()]
    .sort(([a], [b]) => a - b)
    .map(([left, n]) => `${plural(n, 'cell', 'cells')} in ${plural(left, 'turn', 'turns')}`);
  return `Cracks: ${parts.join(' · ')}`;
}

/** Offsets along the disc of the engraved ticks, one per turn left, centred. */
export function tickOffsets(left: number): number[] {
  return Array.from({ length: left }, (_, i) => (i - (left - 1) / 2) * TICK_GAP);
}

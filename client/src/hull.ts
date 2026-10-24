// The Hull tell (docs/specs/game-design.md section 7.1): rim cells crack, tick for 2 plies, then
// vanish. Pure helpers over the bridge's `cracks()` records, the board drawing lives in main.ts.
import { cellIndex, type Axial } from './board';

const CRACK_STRIDE = 3;
/** Spacing of the engraved ticks on a cracked disc, in board units. */
const TICK_GAP = 0.2;

export interface Crack {
  cell: Axial;
  left: number; // plies before the cell vanishes
}

/** Splits the flat `[q, r, plies_left]` records of `Encounter.cracks()`. */
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

/** Plies left by board index, for the cells that are cracked. */
export function crackLeft(cracks: readonly Crack[]): Map<number, number> {
  return new Map(cracks.map((c) => [cellIndex(c.cell[0], c.cell[1]), c.left]));
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** HUD fallback of the tell, '' without cracks: "Rim cracks: 1 cell in 1 ply · 2 cells in 2 plies". */
export function crackText(cracks: readonly Crack[]): string {
  if (cracks.length === 0) return '';
  const byLeft = new Map<number, number>();
  for (const c of cracks) byLeft.set(c.left, (byLeft.get(c.left) ?? 0) + 1);
  const parts = [...byLeft.entries()]
    .sort(([a], [b]) => a - b)
    .map(([left, n]) => `${plural(n, 'cell', 'cells')} in ${plural(left, 'ply', 'plies')}`);
  return `Rim cracks: ${parts.join(' · ')}`;
}

/** Offsets along the disc of the engraved ticks, one per ply left, centred. */
export function tickOffsets(left: number): number[] {
  return Array.from({ length: left }, (_, i) => (i - (left - 1) / 2) * TICK_GAP);
}

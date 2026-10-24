// The Chaplain tell (docs/specs/game-design.md section 7.3, Decision #154): hovering a move shows the
// player marbles it would leave with enough boss neighbours to flip at the end of the boss turn.
// Pure helpers over the bridge's cell lists, the board drawing lives in main.ts.
import type { Axial } from './board';

export interface PreviewEngine {
  play(mv: Int32Array): void;
  flips(): ArrayLike<number>;
}

/** Splits a flat `[q, r]` cell list of the bridge (`flips()`, `converted()`). */
export function parseCells(flat: ArrayLike<number>): Axial[] {
  if (flat.length % 2 !== 0) throw new Error(`cell array length ${flat.length} is not even`);
  const cells: Axial[] = [];
  for (let i = 0; i < flat.length; i += 2) cells.push([flat[i]!, flat[i + 1]!]);
  return cells;
}

/** The marbles `record` would expose, on the position reached by `history`: replayed in a fresh
 * fight, the move played, then the boss's `flips()`. A move the engine rejects exposes nothing. */
export function previewFlips(history: number[][], record: number[] | null, make: () => PreviewEngine): Axial[] {
  if (!record) return [];
  const fight = make();
  for (const mv of history) fight.play(Int32Array.from(mv));
  try {
    fight.play(Int32Array.from(record));
  } catch {
    return [];
  }
  return parseCells(fight.flips());
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** HUD fallback of the tell, '' when nothing is exposed or converted. */
export function chaplainText(exposed: number, converted: number): string {
  const parts = [];
  if (exposed > 0) parts.push(`Flips next boss turn: ${plural(exposed, 'marble', 'marbles')}`);
  if (converted > 0) parts.push(`Converted: ${converted}`);
  return parts.join(' · ');
}

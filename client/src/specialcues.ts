// The cues of the special marbles in a rogue-lite fight (docs/specs/roguelite.md sections 6 and 13, #1490): the Bomb's
// fuse. Pure helpers over the bridge's records; the drawing lives in main.ts, and the engine is the only judge.
import type { Axial } from './board';

/** A Bomb's fuse: its cell and the turns of its side left. */
export interface Fuse {
  cell: Axial;
  turns: number;
}

/** Splits the flat records `[q, r, turns]` of `Engine.fuses()`. */
export function parseFuses(flat: ArrayLike<number>): Fuse[] {
  const fuses: Fuse[] = [];
  for (let i = 0; i < flat.length; i += 3) fuses.push({ cell: [flat[i]!, flat[i + 1]!], turns: flat[i + 2]! });
  return fuses;
}

/** The HUD line of the Bombs on the board, starting with ' · ' like the other notes; nothing without a Bomb. */
export function fuseNote(fuses: Fuse[]): string {
  if (fuses.length === 0) return '';
  const turns = fuses.map((f) => f.turns);
  if (fuses.length > 1) return ` · Bombs: ${turns.join(', ')} turns left`;
  return ` · Bomb: ${turns[0]} turn${turns[0] === 1 ? '' : 's'} left`;
}

/** The seven bar segments of a fuse digit in units of the Bomb glyph's radius, `[x, y, width, height]`, y up. */
const [A, B, C, D, E, G] = [
  [-0.3, 0.35, 0.6, 0.2],
  [0.1, 0, 0.2, 0.55],
  [0.1, -0.55, 0.2, 0.55],
  [-0.3, -0.55, 0.6, 0.2],
  [-0.3, -0.55, 0.2, 0.55],
  [-0.3, -0.1, 0.6, 0.2],
] as const;
const DIGITS: readonly (readonly (readonly [number, number, number, number])[])[] = [[], [B, C], [A, B, G, E, D], [A, B, G, C, D]];

/** The bars of the digit `turns` (1 to 3) drawn on a Bomb, in the shell's ink over its pink glyph. */
export const fuseDigit = (turns: number): readonly (readonly [number, number, number, number])[] => DIGITS[turns]!;

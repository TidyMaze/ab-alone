// The cues of the special marbles in a rogue-lite fight (docs/specs/roguelite.md sections 6 and 13, #1490): the Bomb's
// fuse, and what a ply did that the board alone does not show. Pure helpers over the bridge's records; the drawing lives
// in main.ts, and the engine is the only judge: a cue is read from its result, never decides one.
import { DIRECTIONS, axialTo3D, cellIndex, isMarble, type Axial, type Move } from './board';
import { boardAfter } from './echo';
import type { Special } from './roguelite';
import { SLIDE_MS, pushedCells, type SlideTrack } from './slide';

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

/** A Magnet's pull: the marble on `from` slid one cell in direction `dir` to `to`. */
export interface Pull {
  from: Axial;
  to: Axial;
  dir: number;
}

/** What a ply did: the cells where a Bomb burst, where a Shield held a push, the marbles a Magnet pulled and the cells a
 * Medic thrown off came back on. */
export interface Cues {
  bursts: Axial[];
  flashes: Axial[];
  pulls: Pull[];
  returns: Axial[];
}

const MAGNET = 7;
const SHIELD = 8;
const MEDIC = 10;
/** The directions in the order the engine tries them for a pull: by `q`, then `r` of the direction. */
const PULL_ORDER = DIRECTIONS.map((_, i) => i).sort((a, b) => DIRECTIONS[a]![0] - DIRECTIONS[b]![0] || DIRECTIONS[a]![1] - DIRECTIONS[b]![1]);
/** Black's back row in the order a Medic fills it, White's the opposite cells. */
const BLACK_ROW: readonly Axial[] = [[-4, 4], [-3, 4], [-2, 4], [-1, 4], [0, 4]];
const rowOf = (side: number): Axial[] => BLACK_ROW.map(([q, r]): Axial => (side === 1 ? [q, r] : [-q, -r]));
const isAt = (specials: Special[], cell: Axial, kind: number): boolean => specials.some((s) => s.kind === kind && s.cell[0] === cell[0] && s.cell[1] === cell[1]);

/** The cues of the ply `mv` that took the board `before`, with its marks `specials` and the Bombs' `fuses`, to the engine's
 * board `after` and marks `afterSpecials` (docs/specs/roguelite.md section 13). A Shield in the pushed line stops the push:
 * it flashes and nothing moves. Else the Magnets that moved (the pushed ones too) pull in cell order, and a Bomb of the
 * mover on its last turn bursts where its marble stands. A pull is shown only when the engine's board has it. */
export function specialCues(before: ArrayLike<number>, specials: Special[], fuses: Fuse[], mv: Move, after: ArrayLike<number>, afterSpecials: Special[]): Cues {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  const moved = pushedCells(before, mv);
  const flashes = moved.slice(mv.cells.length).filter((cell) => isAt(specials, cell, SHIELD));
  const stops = flashes.length > 0;
  const side = before[cellIndex(...mv.cells[0]!)]!;
  const bursts = fuses
    .filter((f) => f.turns === 1 && before[cellIndex(...f.cell)] === side)
    .map(({ cell }): Axial => (!stops && mv.cells.some((c) => c[0] === cell[0] && c[1] === cell[1]) ? [cell[0] + dq, cell[1] + dr] : cell));
  // The board once the move is done, the pulls one after the other on it.
  const now = stops ? Array.from(before) : boardAfter(before, mv);
  const pulls: Pull[] = [];
  const magnets = stops ? [] : moved.filter((cell) => isAt(specials, cell, MAGNET)).map(([q, r]): Axial => [q + dq, r + dr]);
  magnets.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [q, r] of magnets) {
    for (const dir of PULL_ORDER) {
      const [pq, pr] = DIRECTIONS[dir]!;
      const [near, far] = [cellIndex(q + pq, r + pr), cellIndex(q + 2 * pq, r + 2 * pr)];
      const foe = now[far];
      if (!isMarble(foe) || foe === now[cellIndex(q, r)] || now[near] !== 0) continue;
      now[far] = 0;
      now[near] = foe!;
      if (after[near] === foe) pulls.push({ from: [q + 2 * pq, r + 2 * pr], to: [q + pq, r + pr], dir: DIRECTIONS.findIndex(([a, b]) => a === -pq && b === -pr) });
      break;
    }
  }
  // A Medic with no mark left was thrown off: it is back on the first cell of its side's row that was free.
  const medics = (marks: Special[], board: ArrayLike<number>, colour: number): number => marks.filter((s) => s.kind === MEDIC && board[cellIndex(...s.cell)] === colour).length;
  const returns = [1, 2].flatMap((colour) =>
    rowOf(colour)
      .filter((cell) => before[cellIndex(...cell)] === 0 && after[cellIndex(...cell)] === colour)
      .slice(0, Math.max(0, medics(specials, before, colour) - medics(afterSpecials, after, colour))),
  );
  return { bursts, flashes, pulls, returns };
}

/** The slide of a pull: the marble goes from its cell to the near one in the time of a move's slide, at once with
 * reduced motion. */
export function pullTrack({ from, to }: Pull, reducedMotion: boolean): SlideTrack {
  const [a, b] = [axialTo3D(...from), axialTo3D(...to)];
  return { cell: to, from: { x: a.x, z: a.z }, to: { x: b.x, z: b.z }, durationMs: reducedMotion ? 0 : SLIDE_MS };
}

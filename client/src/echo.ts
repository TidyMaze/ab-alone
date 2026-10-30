// The Echo's tells (docs/specs/game-design.md section 7.4, #859): the bonus moves a move gives the other side, from
// `Encounter.echo_tell()`, and where moved marbles land. Pure helpers, the meshes live in main.ts.
import { DIRECTIONS, MOVE_STRIDE, parseMoves, type Axial, type Move } from './board';

/** One bonus move of the tell: `skipped` when the engine would not play it (it would lose its receiver the game). */
export interface EchoBonus {
  mv: Move;
  skipped: boolean;
}

/** The bonus moves of `Encounter.echo_tell()`: records of 9, the skipped flag then the move record. */
export function parseEchoTell(flat: ArrayLike<number>): EchoBonus[] {
  const out: EchoBonus[] = [];
  for (let i = 0; i < flat.length; i += MOVE_STRIDE + 1) {
    const [mv] = parseMoves(Array.from(flat).slice(i + 1, i + 1 + MOVE_STRIDE));
    out.push({ mv: mv!, skipped: flat[i] === 1 });
  }
  return out;
}

/** The cells the marbles of `mv` land on. */
export function landing(mv: Move): Axial[] {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  return mv.cells.map(([q, r]) => [q + dq, r + dr] as Axial);
}

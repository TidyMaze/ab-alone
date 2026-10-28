// Pure logic of the replay mode (#793): the player steps through the positions of the move log, view only. The
// position at a ply, boss included, comes from replaying the log on a new engine, which is deterministic.
import { replayMoves, type ReplayEngine } from './savegame';

export type ReplayStep = 'first' | 'prev' | 'next' | 'last';

/** The ply after `step` from `ply`, inside the log: 0 is the start position, `total` the live one. */
export function stepPly(ply: number, step: ReplayStep, total: number): number {
  const to = { first: 0, prev: ply - 1, next: ply + 1, last: total }[step];
  return Math.min(total, Math.max(0, to));
}

/** What a key does: Left and Right step, Left also opens the replay of a game with moves, Escape returns to the live game. */
export function replayKey(key: string, open: boolean, hasMoves: boolean): ReplayStep | 'live' | null {
  if (key === 'ArrowLeft') return open || hasMoves ? 'prev' : null;
  if (key === 'ArrowRight') return open ? 'next' : null;
  return key === 'Escape' && open ? 'live' : null;
}

export function replayLabel(ply: number, total: number): string {
  return `Move ${ply} of ${total}${ply === total ? ' (live)' : ''}`;
}

/** A new engine after the first `ply` moves of `moves`. The log was judged by the engine when it was played. */
export function engineAt<E extends ReplayEngine>(moves: number[][], ply: number, make: () => E): E {
  return replayMoves(moves.slice(0, ply), make)!;
}

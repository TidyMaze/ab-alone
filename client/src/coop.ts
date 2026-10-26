// Co-op boss fights online: whose turn it is, docs/specs/coop-boss.md section 2.

/** Every player seat plays Black, against the boss as White. */
export const COOP_SIDE = 1;

/** The player seat that plays human ply `ply` (0-based, human moves only) with `seats` player seats. */
export function seatOfPly(ply: number, seats: number): number {
  return (ply % seats) + 1;
}

/** The player seat to move after `plies` plies of a co-op fight, boss replies included, with `seats` player seats.
 * Each human ply is followed by its boss reply: a ply whose reply is still being computed counts as answered. */
export function seatAfter(plies: number, seats: number): number {
  return seatOfPly(Math.ceil(plies / 2), seats);
}

/** The HUD turn line of a human ply, from a seated player's side: its own ply or the partner's (#530). */
export function coopTurn(ours: boolean): string {
  return ours ? 'Your turn' : "Partner's turn";
}

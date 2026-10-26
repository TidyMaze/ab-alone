// Co-op boss fights online: whose turn it is, docs/specs/coop-boss.md section 2.

/** Every player seat plays Black, against the boss as White. */
export const COOP_SIDE = 1;

/** The player seat that plays human ply `ply` (0-based, human moves only) with `seats` player seats. */
export function seatOfPly(ply: number, seats: number): number {
  return (ply % seats) + 1;
}

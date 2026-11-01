// Co-op boss fights online: whose turn it is, docs/specs/coop-boss.md section 2.

/** Every player seat plays Black, against the boss as White. */
export const COOP_SIDE = 1;

/** The player seat that plays human ply `ply` (0-based, human moves only) with `seats` player seats. */
export function seatOfPly(ply: number, seats: number): number {
  return (ply % seats) + 1;
}

/** The player seat to move after `plies` plies of a co-op fight, boss replies included and the Echo's free moves left
 * out (#958), with `seats` player seats. Each human ply is followed by its boss reply: a ply whose reply is still being
 * computed counts as answered. */
export function seatAfter(plies: number, seats: number): number {
  return seatOfPly(Math.ceil(plies / 2), seats);
}

/** The HUD turn line of a human ply, from a seated player's side: its own ply or the partner's (#530). */
export function coopTurn(ours: boolean): string {
  return ours ? 'Your turn' : "Partner's turn";
}

/** The HUD line of a finished fight that says who asked for a Retry, naming the partner (#531). The e2e tests read it. */
export function retryText(we: boolean, they: boolean): string {
  if (we) return 'You asked for a retry. Waiting for your partner...';
  return they ? 'Your partner asks for a retry.' : '';
}

/** The boss plate line of the room's attempt, one counter for every seat (#531). */
export const attemptLine = (attempt: number): string => `Fight together · attempt ${attempt}`;

/** The HUD turn line of a boss duel (#1316): White plays the boss, Black the hero. `side` is our seat, `ours` whether it is our ply. */
export function duelTurn(side: number, ours: boolean): string {
  if (ours) return 'Your turn';
  return side === 1 ? "Boss's turn" : "Hero's turn";
}

/** The boss plate line of a boss duel, which has no attempt counter (#1316). */
export const DUEL_LINE = 'Boss duel';

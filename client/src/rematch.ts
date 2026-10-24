// Rematch: a new game on the same channel once every seated key asked, docs/specs/tech.md section 6.
// The seats stay bound to the same keys, the colours swap (rules.md section 10.2).
import { sideName } from './glass';

/** The id of the game that follows `game` in its room. Every peer derives the same id, and it is
 * never one of the room's earlier ids, so a move or an ask signed for an old game is refused. */
export async function nextGameId(game: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['rematch', game])));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The colour the key of room seat `seat` plays in game `n` of the room, 0 being the first game.
 * Each rematch swaps the two colours (with more seats, they rotate). */
export function colourOf(seat: number, n: number, count: number): number {
  return ((seat - 1 + n) % count) + 1;
}

/** The room seat that plays `colour` in game `n`: the inverse of colourOf. */
export function seatFor(colour: number, n: number, count: number): number {
  return ((((colour - 1 - n) % count) + count) % count) + 1;
}

/** The HUD rematch line of a finished game, see docs/specs/ui.md section 4. The e2e tests read it. */
export function rematchText(side: number, we: boolean, they: boolean, glass: number): string {
  const them = sideName(3 - side, glass);
  if (we) return `You asked for a rematch. Waiting for ${them}...`;
  return they ? `${them} asks for a rematch.` : '';
}

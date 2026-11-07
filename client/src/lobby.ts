// The lobby's offer after a wait with no peer (#1529, first slice: Play online only). Pure state: the caller passes the elapsed
// time and the peers in the room, so a test moves time without waiting.

export const BOT_OFFER_MS = 30000; // 30 s with no peer: the lobby offers the bot (not rated) and the invite link

/** `wait`: keep waiting; `offer`: nobody joined, offer the bot; `joined`: a peer is in, no offer. Ranked, Co-op and a boss duel never offer. */
export type LobbyState = 'wait' | 'offer' | 'joined';
export type LobbyMode = 'online' | 'ranked' | 'coop' | 'duel';

export function lobbyState(elapsedMs: number, peers: number, mode: LobbyMode, waitMs = BOT_OFFER_MS): LobbyState {
  if (peers > 0) return 'joined';
  return mode === 'online' && elapsedMs >= waitMs ? 'offer' : 'wait';
}

/** The wait before the offer: 30 s, or the `lobbywait` URL parameter (ms) under navigator.webdriver, so an e2e or unit test sees
 * the offer at once. A player never gets a shortened one. */
export function lobbyWaitMs(search: string, webdriver: boolean): number {
  const ms = Number(new URLSearchParams(search).get('lobbywait'));
  return webdriver && Number.isInteger(ms) && ms >= 50 ? ms : BOT_OFFER_MS;
}

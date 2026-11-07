import { describe, expect, it } from 'vitest';
import { BOT_OFFER_MS, lobbyState, lobbyWaitMs } from './lobby';

describe('lobbyState (#1529)', () => {
  it('waits under 30 s with no peer', () => {
    expect(lobbyState(0, 0, 'online')).toBe('wait');
    expect(lobbyState(BOT_OFFER_MS - 1, 0, 'online')).toBe('wait');
  });

  it('offers the bot at 30 s with no peer, and after', () => {
    expect(BOT_OFFER_MS).toBe(30000);
    expect(lobbyState(BOT_OFFER_MS, 0, 'online')).toBe('offer');
    expect(lobbyState(BOT_OFFER_MS + 5000, 0, 'online')).toBe('offer');
  });

  it('a peer joining hides the offer, before or after the wait', () => {
    expect(lobbyState(0, 1, 'online')).toBe('joined');
    expect(lobbyState(BOT_OFFER_MS, 1, 'online')).toBe('joined');
  });

  it('never offers the bot in Ranked, Co-op or a boss duel', () => {
    for (const mode of ['ranked', 'coop', 'duel'] as const) {
      expect(lobbyState(BOT_OFFER_MS * 10, 0, mode)).toBe('wait');
    }
  });

  it('takes the wait from its argument, the test hook shortens it', () => {
    expect(lobbyState(80, 0, 'online', 80)).toBe('offer');
    expect(lobbyState(79, 0, 'online', 80)).toBe('wait');
  });
});

describe('lobbyWaitMs (#1529)', () => {
  it('is 30 s for a player, whatever the URL says', () => {
    expect(lobbyWaitMs('?lobbywait=80', false)).toBe(30000);
  });

  it('is the lobbywait parameter under navigator.webdriver, an integer of at least 50 ms', () => {
    expect(lobbyWaitMs('?lobbywait=80', true)).toBe(80);
    expect(lobbyWaitMs('?lobbywait=49', true)).toBe(30000);
    expect(lobbyWaitMs('?lobbywait=1.5', true)).toBe(30000);
    expect(lobbyWaitMs('', true)).toBe(30000);
  });
});

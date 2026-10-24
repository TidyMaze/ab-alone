import { describe, expect, it, vi } from 'vitest';

// A Trystero room the test drives by hand: no relay, no WebRTC.
const room = vi.hoisted(() => ({
  onPeerJoin: null as ((peer: string) => void) | null,
  onPeerLeave: null as ((peer: string) => void) | null,
  makeAction: () => ({ send: async () => {}, onMessage: null }),
  leave: async () => {},
}));
vi.mock('trystero/nostr', () => ({ joinRoom: () => room }));

const { p2pTransport } = await import('./p2p');

describe('p2pTransport', () => {
  it('stays open while a peer is still connected: a spectator leaving does not close the room, bug #140', () => {
    const t = p2pTransport('r');
    const states: string[] = [];
    t.onState((s) => states.push(s));
    expect(t.state).toBe('connecting');
    room.onPeerJoin!('white');
    room.onPeerJoin!('spectator');
    room.onPeerLeave!('spectator');
    expect(t.state).toBe('open');
    room.onPeerLeave!('white');
    expect(t.state).toBe('closed');
    expect(states).toEqual(['open', 'open', 'closed']);
  });

  it('opens again when a peer comes back', () => {
    const t = p2pTransport('r');
    room.onPeerJoin!('white');
    room.onPeerLeave!('white');
    room.onPeerJoin!('white');
    expect(t.state).toBe('open');
  });
});

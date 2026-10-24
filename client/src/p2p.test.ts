import { describe, expect, it, vi } from 'vitest';
import { GENESIS } from './moverecord';

// A Trystero room the test drives by hand: no relay, no WebRTC.
const room = vi.hoisted(() => {
  const send = vi.fn(async (..._args: unknown[]) => {});
  return {
    send,
    onPeerJoin: null as ((peer: string) => void) | null,
    onPeerLeave: null as ((peer: string) => void) | null,
    makeAction: () => ({ send, onMessage: null }),
    leave: async () => {},
  };
});
// The callbacks p2pTransport gave the last joinRoom call.
const joined = vi.hoisted(() => ({ callbacks: undefined as { onJoinError?: (e: { error: string }) => void } | undefined }));
vi.mock('trystero/nostr', () => ({
  joinRoom: (_config: unknown, _room: string, callbacks?: typeof joined.callbacks) => {
    joined.callbacks = callbacks;
    return room;
  },
}));

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

  it('hands a Trystero join error to the diagnostics, ICE failures included', () => {
    const errors: string[] = [];
    p2pTransport('r', (message) => errors.push(message));
    joined.callbacks!.onJoinError!({ error: 'could not connect to peer p after exchanging SDP' });
    expect(errors).toEqual(['could not connect to peer p after exchanging SDP']);
    p2pTransport('r'); // no listener: the error is dropped
    expect(() => joined.callbacks!.onJoinError!({ error: 'x' })).not.toThrow();
  });

  it('opens again when a peer comes back', () => {
    const t = p2pTransport('r');
    room.onPeerJoin!('white');
    room.onPeerLeave!('white');
    room.onPeerJoin!('white');
    expect(t.state).toBe('open');
  });

  it('sends to the one peer it is told to, to every peer otherwise: a catch-up answer goes to the peer behind, #226', () => {
    const t = p2pTransport('r');
    const rec = { game: 'g', seq: 0, prev: GENESIS, move: [1, 0, 0, 2, 0, 0, 0, 0], pub: 'k', sig: 's' };
    room.send.mockClear();
    t.send(rec);
    t.send(rec, 'white');
    expect(room.send.mock.calls).toEqual([
      [rec, { target: undefined }],
      [rec, { target: 'white' }],
    ]);
  });
});

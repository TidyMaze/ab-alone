import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENESIS } from './moverecord';

// A Trystero room the test drives by hand: no relay, no WebRTC.
const room = vi.hoisted(() => {
  const send = vi.fn(async (..._args: unknown[]) => {});
  const action = { send, onMessage: null as ((data: unknown, meta: { peerId: string }) => void) | null };
  return {
    send,
    action,
    onPeerJoin: null as ((peer: string) => void) | null,
    onPeerLeave: null as ((peer: string) => void) | null,
    actions: [] as string[],
    makeAction: (name: string) => {
      room.actions.push(name);
      return action;
    },
    leave: vi.fn(async () => {}),
  };
});
// The callbacks p2pTransport gave the last joinRoom call.
const joined = vi.hoisted(() => ({ config: undefined as { appId: string; relayConfig?: { urls?: string[] } } | undefined, callbacks: undefined as { onJoinError?: (e: { error: string }) => void } | undefined }));
vi.mock('trystero/nostr', () => ({
  joinRoom: (config: unknown, _room: string, callbacks?: typeof joined.callbacks) => {
    joined.config = config as typeof joined.config;
    joined.callbacks = callbacks;
    return room;
  },
}));

const { RELAY_URLS, hookPeers, hookTransport, p2pPeers, p2pTransport } = await import('./p2p');

describe('p2pTransport', () => {
  it('joins on the relay shortlist, never the 29 defaults (#1338)', () => {
    p2pTransport('r');
    expect(joined.config?.relayConfig?.urls).toEqual(RELAY_URLS);
    expect(RELAY_URLS).toEqual(['wss://relay.piazza.today', 'wss://nos.lol', 'wss://nostr.red5d.dev', 'wss://relay.bitmacro.cloud']);
  });


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

describe('p2pTransport records, leaves and close', () => {
  const rec = { game: 'g', seq: 0, prev: GENESIS, move: [1, 0, 0, 2, 0, 0, 0, 0], pub: 'k', sig: 's' };

  it('hands each received record to the session with the name of the peer that sent it', () => {
    const t = p2pTransport('r');
    const got: [unknown, string][] = [];
    t.onRecord((message, peer) => got.push([message, peer]));
    room.action.onMessage!(rec, { peerId: 'white' });
    expect(got).toEqual([[rec, 'white']]);
  });

  it('tells which peer left', () => {
    const t = p2pTransport('r');
    const left: string[] = [];
    t.onLeave((peer) => left.push(peer));
    room.onPeerJoin!('white');
    room.onPeerLeave!('white');
    expect(left).toEqual(['white']);
  });

  it('leaves the Trystero room on close and says closed', () => {
    const t = p2pTransport('r');
    const states: string[] = [];
    t.onState((s) => states.push(s));
    room.leave.mockClear();
    t.close();
    expect(room.leave).toHaveBeenCalledOnce();
    expect(t.state).toBe('closed');
    expect(states).toEqual(['closed']);
  });
});

describe('hookTransport', () => {
  interface Hook {
    __netOut?: (rec: unknown, to?: string) => void;
    __netIn?: (rec: unknown, peer: string) => void;
    __netOpen?: () => void;
    __netLeave?: (peer: string) => void;
  }
  afterEach(() => void vi.unstubAllGlobals());
  const page = (): Hook => {
    const w: Hook = {};
    vi.stubGlobal('window', w);
    return w;
  };
  const rec = { game: 'g', seq: 0, prev: GENESIS, move: [1, 0, 0, 2, 0, 0, 0, 0], pub: 'k', sig: 's' };

  it('stays connecting until the test opens it', () => {
    const w = page();
    const t = hookTransport();
    const states: string[] = [];
    expect(t.state).toBe('connecting');
    w.__netOpen!(); // before onState: no listener yet
    t.onState((s) => states.push(s));
    w.__netOpen!();
    expect(t.state).toBe('open');
    expect(states).toEqual(['open']);
  });

  it('hands sent records to __netOut with their one peer, and drops them while the test listens to none', () => {
    const w = page();
    const t = hookTransport();
    t.send(rec); // no __netOut yet
    const out: [unknown, string | undefined][] = [];
    w.__netOut = (r, to) => out.push([r, to]);
    t.send(rec);
    t.send(rec, 'white');
    expect(out).toEqual([
      [rec, undefined],
      [rec, 'white'],
    ]);
  });

  it('receives records on __netIn and peer leaves on __netLeave; close does nothing', () => {
    const w = page();
    const t = hookTransport();
    const got: [unknown, string][] = [];
    const left: string[] = [];
    t.onRecord((r, peer) => got.push([r, peer]));
    t.onLeave((peer) => left.push(peer));
    w.__netIn!(rec, 'white');
    w.__netLeave!('white');
    t.close();
    expect(got).toEqual([[rec, 'white']]);
    expect(left).toEqual(['white']);
    expect(t.state).toBe('connecting');
  });
});

describe('p2pPeers (the public world, #1305)', () => {
  it('joins on the shortlist, one action for the world messages, and hands bytes and peers over', () => {
    const net = p2pPeers('ow:1305:0');
    expect(joined.config?.relayConfig?.urls).toEqual(RELAY_URLS);
    expect(room.actions).toContain('world');
    const got: [Uint8Array, string][] = [];
    const joins: string[] = [];
    const leaves: string[] = [];
    net.onData((d, peer) => got.push([d, peer]));
    net.onJoin((peer) => joins.push(peer));
    net.onLeave((peer) => leaves.push(peer));
    room.onPeerJoin!('p');
    room.onPeerLeave!('p');
    room.action.onMessage!(Uint8Array.of(1, 1), { peerId: 'p' });
    expect(joins).toEqual(['p']);
    expect(leaves).toEqual(['p']);
    expect(got).toEqual([[Uint8Array.of(1, 1), 'p']]);
  });

  it('sends to one peer or to all, and leaves the room on close', () => {
    const net = p2pPeers('r');
    room.send.mockClear();
    net.send(Uint8Array.of(1, 1));
    net.send(Uint8Array.of(1, 1), 'p');
    expect(room.send.mock.calls).toEqual([
      [Uint8Array.of(1, 1), { target: undefined }],
      [Uint8Array.of(1, 1), { target: 'p' }],
    ]);
    room.leave.mockClear();
    net.close();
    expect(room.leave).toHaveBeenCalledOnce();
  });

  it('ignores a peer event nobody listens to', () => {
    p2pPeers('r');
    expect(() => {
      room.onPeerJoin!('p');
      room.onPeerLeave!('p');
      room.action.onMessage!(Uint8Array.of(1, 1), { peerId: 'p' });
    }).not.toThrow();
  });
});

describe('hookPeers', () => {
  interface Hook {
    __netPeerOut?: (data: Uint8Array, to?: string) => void;
    __netPeerIn?: (data: number[] | Uint8Array, peer: string) => void;
    __netPeerJoin?: (peer: string) => void;
    __netPeerLeave?: (peer: string) => void;
  }
  afterEach(() => void vi.unstubAllGlobals());
  const page = (): Hook => {
    const w: Hook = {};
    vi.stubGlobal('window', w);
    return w;
  };

  it('hands sent bytes to __netPeerOut with their one peer, and drops them while the test listens to none', () => {
    const w = page();
    const net = hookPeers();
    net.send(Uint8Array.of(1, 1)); // no __netPeerOut yet
    const out: [Uint8Array, string | undefined][] = [];
    w.__netPeerOut = (d, to) => out.push([d, to]);
    net.send(Uint8Array.of(1, 1));
    net.send(Uint8Array.of(1, 2), 'p');
    expect(out).toEqual([
      [Uint8Array.of(1, 1), undefined],
      [Uint8Array.of(1, 2), 'p'],
    ]);
  });

  it('receives bytes (a plain array from the test too), joins and leaves; close does nothing', () => {
    const w = page();
    const net = hookPeers();
    const got: [Uint8Array, string][] = [];
    const events: string[] = [];
    net.onData((d, peer) => got.push([d, peer]));
    net.onJoin((peer) => events.push(`join ${peer}`));
    net.onLeave((peer) => events.push(`leave ${peer}`));
    w.__netPeerIn!([1, 1], 'p');
    w.__netPeerIn!(Uint8Array.of(1, 1), 'q');
    w.__netPeerJoin!('p');
    w.__netPeerLeave!('p');
    net.close();
    expect(got).toEqual([
      [Uint8Array.of(1, 1), 'p'],
      [Uint8Array.of(1, 1), 'q'],
    ]);
    expect(events).toEqual(['join p', 'leave p']);
  });
});

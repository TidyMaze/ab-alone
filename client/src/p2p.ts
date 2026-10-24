// Transports that touch the outside world. Out of the coverage gate: the e2e test drives the hook transport,
// and the Trystero one needs real public relays and a second browser (see the PR body). Its peer
// bookkeeping is unit tested on a mocked room (p2p.test.ts).
import { joinRoom } from 'trystero/nostr';
import type { Wire } from './moverecord';
import type { ConnectionState, Transport } from './transport';

const APP_ID = 'ab-alone';

/** Serverless P2P: Trystero finds the peer through public Nostr relays, moves go over WebRTC. */
export function p2pTransport(room: string): Transport {
  const r = joinRoom({ appId: APP_ID }, room);
  const move = r.makeAction('move');
  let state: ConnectionState = 'connecting';
  let onState: (s: ConnectionState) => void = () => {};
  let onLeave: (peer: string) => void = () => {};
  const set = (s: ConnectionState): void => {
    state = s;
    onState(s);
  };
  // Open while at least one peer is connected: a spectator leaving does not close the room for the players (#140).
  const peers = new Set<string>();
  r.onPeerJoin = (peer) => {
    peers.add(peer);
    set('open');
  };
  r.onPeerLeave = (peer) => {
    peers.delete(peer);
    onLeave(peer);
    if (peers.size === 0) set('closed');
  };
  return {
    get state() {
      return state;
    },
    send: (rec) => void move.send(rec as unknown as Parameters<typeof move.send>[0]),
    onRecord: (cb) => {
      move.onMessage = (data, { peerId }) => cb(data as unknown as Wire, peerId); // the session shape checks it
    },
    onState: (cb) => {
      onState = cb;
    },
    onLeave: (cb) => {
      onLeave = cb;
    },
    close: () => {
      void r.leave();
      set('closed');
    },
  };
}

interface Hook {
  __netOut?: (rec: Wire) => void;
  __netIn?: (rec: Wire, peer: string) => void;
  __netOpen?: () => void;
  __netLeave?: (peer: string) => void;
}

/**
 * Test transport: the page hands records to `window.__netOut` and receives them on `window.__netIn`
 * with the sender's name. It stays `connecting` until the test calls `window.__netOpen()`, and
 * `window.__netLeave(peer)` stands in for Trystero's peer leave.
 */
export function hookTransport(): Transport {
  const w = window as unknown as Hook;
  let state: ConnectionState = 'connecting';
  let onState: (s: ConnectionState) => void = () => {};
  w.__netOpen = () => {
    state = 'open';
    onState(state);
  };
  return {
    get state() {
      return state;
    },
    send: (rec) => w.__netOut?.(rec),
    onRecord: (cb) => {
      w.__netIn = cb;
    },
    onState: (cb) => {
      onState = cb;
    },
    onLeave: (cb) => {
      w.__netLeave = cb;
    },
    close: () => {},
  };
}

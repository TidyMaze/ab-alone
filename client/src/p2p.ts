// Transports that touch the outside world: the hook transport the e2e test drives, and Trystero over public
// relays. p2p.test.ts tests both, Trystero on a mocked room.
import { joinRoom } from 'trystero/nostr';
import type { Wire } from './moverecord';
import type { ConnectionState, Transport } from './transport';

const APP_ID = 'ab-alone';

/** The relay shortlist (docs/specs/multiplayer.md section 7, #1338), instead of Trystero's defaults (`relayConfig.urls` in trystero 0.26, the issue says `relayUrls`). */
export const RELAY_URLS = ['wss://relay.piazza.today', 'wss://nos.lol', 'wss://nostr.red5d.dev', 'wss://relay.bitmacro.cloud'];

/**
 * Serverless P2P: Trystero finds the peer through public Nostr relays, moves go over WebRTC.
 * `onJoinError` gets Trystero's join errors, an ICE failure among them, for the diagnostics (#220).
 */
export function p2pTransport(room: string, onJoinError?: (message: string) => void): Transport {
  const r = joinRoom({ appId: APP_ID, relayConfig: { urls: RELAY_URLS } }, room, { onJoinError: (e) => onJoinError?.(e.error) });
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
    send: (rec, to) => void move.send(rec as unknown as Parameters<typeof move.send>[0], { target: to }), // no target: every peer
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
  __netOut?: (rec: Wire, to?: string) => void;
  __netIn?: (rec: Wire, peer: string) => void;
  __netOpen?: () => void;
  __netLeave?: (peer: string) => void;
}

/**
 * Test transport: the page hands records to `window.__netOut`, with the name of the one peer they are
 * for if any, and receives them on `window.__netIn` with the sender's name. It stays `connecting` until
 * the test calls `window.__netOpen()`, and `window.__netLeave(peer)` stands in for Trystero's peer leave.
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
    send: (rec, to) => w.__netOut?.(rec, to),
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

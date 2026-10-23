// Transports that touch the outside world. Not unit tested: the e2e test drives the hook transport,
// and the Trystero one needs real public relays and a second browser (see the PR body).
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
  const set = (s: ConnectionState): void => {
    state = s;
    onState(s);
  };
  r.onPeerJoin = () => set('open');
  r.onPeerLeave = () => set('closed');
  return {
    get state() {
      return state;
    },
    send: (rec) => void move.send(rec as unknown as Parameters<typeof move.send>[0]),
    onRecord: (cb) => {
      move.onMessage = (data) => cb(data as unknown as Wire); // the session shape checks it
    },
    onState: (cb) => {
      onState = cb;
    },
    close: () => {
      void r.leave();
      set('closed');
    },
  };
}

interface Hook {
  __netOut?: (rec: Wire) => void;
  __netIn?: (rec: Wire) => void;
  __netOpen?: () => void;
}

/** Test transport: the page hands records to `window.__netOut` and receives them on `window.__netIn`. It stays `connecting` until the test calls `window.__netOpen()`. */
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
    close: () => {},
  };
}

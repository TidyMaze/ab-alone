import type { Wire } from './moverecord';

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** One ordered channel for signed move records and Hello messages. Local play, P2P and later a server all fit it. */
export interface Transport {
  readonly state: ConnectionState;
  /** To every peer, or to the one peer `to` names as onRecord named it: a catch-up answer goes to the peer behind alone. */
  send(message: Wire, to?: string): void;
  /** `peer` names the sender as the transport knows it, not by key: only a Hello proves a key. */
  onRecord(cb: (message: Wire, peer: string) => void): void;
  onState(cb: (state: ConnectionState) => void): void;
  /** The transport lost a peer. */
  onLeave(cb: (peer: string) => void): void;
  close(): void;
}

/** In-memory end of a local pair: delivery is synchronous and in order, nothing touches the network.
 * Its one peer is every peer, so a send to one peer goes to it too. */
class LocalTransport implements Transport {
  state: ConnectionState = 'open';
  peer!: LocalTransport;
  private record: (r: Wire, peer: string) => void = () => {};
  private change: (s: ConnectionState) => void = () => {};
  private left: (peer: string) => void = () => {};

  constructor(private readonly name: string) {}

  send(r: Wire): void {
    if (this.state === 'open') this.peer.record(r, this.name);
  }
  onRecord(cb: (message: Wire, peer: string) => void): void {
    this.record = cb;
  }
  onState(cb: (state: ConnectionState) => void): void {
    this.change = cb;
  }
  onLeave(cb: (peer: string) => void): void {
    this.left = cb;
  }
  close(): void {
    if (this.state === 'closed') return;
    for (const end of [this, this.peer]) {
      end.state = 'closed';
      end.change('closed');
    }
    for (const end of [this, this.peer]) end.left(end.peer.name);
  }
}

/** Two connected ends: two players on one screen, as local play has always been. */
export function localPair(): [Transport, Transport] {
  const a = new LocalTransport('a');
  const b = new LocalTransport('b');
  a.peer = b;
  b.peer = a;
  return [a, b];
}

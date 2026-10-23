import type { MoveRecord } from './moverecord';

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** One ordered channel for signed move records. Local play, P2P and later a server all fit it. */
export interface Transport {
  readonly state: ConnectionState;
  send(record: MoveRecord): void;
  onRecord(cb: (record: MoveRecord) => void): void;
  onState(cb: (state: ConnectionState) => void): void;
  close(): void;
}

/** In-memory end of a local pair: delivery is synchronous and in order, nothing touches the network. */
class LocalTransport implements Transport {
  state: ConnectionState = 'open';
  peer!: LocalTransport;
  private record: (r: MoveRecord) => void = () => {};
  private change: (s: ConnectionState) => void = () => {};

  send(r: MoveRecord): void {
    if (this.state === 'open') this.peer.record(r);
  }
  onRecord(cb: (record: MoveRecord) => void): void {
    this.record = cb;
  }
  onState(cb: (state: ConnectionState) => void): void {
    this.change = cb;
  }
  close(): void {
    if (this.state === 'closed') return;
    for (const end of [this, this.peer]) {
      end.state = 'closed';
      end.change('closed');
    }
  }
}

/** Two connected ends: two players on one screen, as local play has always been. */
export function localPair(): [Transport, Transport] {
  const a = new LocalTransport();
  const b = new LocalTransport();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

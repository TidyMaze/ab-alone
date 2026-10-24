import { MoveLog } from './movelog';
import { parseHello, parseRecord, signHello, verifyHello, type Hello, type Keys, type Wire } from './moverecord';
import { Presence, type Seen } from './presence';
import { Seats } from './seats';
import type { ConnectionState, Transport } from './transport';

/** The rules engine, the only judge of legality. `play` throws on an illegal move. */
export interface Judge {
  to_move(): number;
  play(mv: Int32Array): void;
}

const CREATOR = 1; // the room creator holds seat 1 (Black) and decides who gets the others

/** `pending`: asked for a seat, no answer yet. `spectator`: the room is full, we follow but never send. */
export type Role = 'pending' | 'player' | 'spectator';

export interface SessionOptions {
  game: string;
  side: number; // the seat we are or ask for: 1 Black, 2 White
  seatCount?: number; // seats of the mode, 2 for 1v1
  keys: Keys;
  transport: Transport;
  judge: Judge;
  onMove(move: number[]): void; // a verified, legal move from the other side was applied
  onRefuse(reason: string): void; // a move was refused: shown in the HUD
  onState?(state: ConnectionState): void;
  onRole?(role: Role): void;
  onPresence?(): void; // a key said Hello or its peer left: read presenceOf again
}

/**
 * Sends our moves signed and chained, replays the other side's moves through the engine.
 * Each seat is bound to one key by signed Hello messages: the creator binds the first valid Hello
 * for a free seat and publishes the roster, a move counts only from the key of the side to move.
 * A seat is present while a peer that proved its key is connected.
 */
export class OnlineSession {
  readonly seats: Seats;
  private readonly log: MoveLog;
  private readonly presence = new Presence();
  private queue: Promise<void> = Promise.resolve();
  private current: Role;

  constructor(private readonly o: SessionOptions) {
    this.log = new MoveLog(o.game, o.keys.pub);
    this.seats = new Seats(o.seatCount ?? 2);
    this.current = o.side === CREATOR ? 'player' : 'pending';
    if (o.side === CREATOR) this.seats.claim(CREATOR, o.keys.pub);
    o.transport.onRecord((m, peer) => {
      // Verification is async: a queue keeps messages handled in arrival order.
      this.queue = this.queue.then(() => this.receive(m, peer));
    });
    // In the same queue: a peer that leaves right after its Hello is gone once both are handled.
    o.transport.onLeave((peer) => {
      this.queue = this.queue.then(() => {
        if (this.presence.leave(peer)) o.onPresence?.();
      });
    });
    o.transport.onState((s) => {
      o.onState?.(s);
      if (s === 'open') this.queue = this.queue.then(() => this.hello());
    });
    if (o.transport.state === 'open') this.queue = this.queue.then(() => this.hello());
  }

  get role(): Role {
    return this.current;
  }

  /** Whether the key bound to `seat` is connected. A free seat is `waiting`. */
  presenceOf(seat: number): Seen {
    return this.presence.of(this.seats.keyOf(seat));
  }

  /** We are a seated player, our turn and the transport is open: a move now would reach the others. */
  canPlay(): boolean {
    return this.current === 'player' && this.o.transport.state === 'open' && this.o.judge.to_move() === this.o.side;
  }

  /** The caller already applied `move` to its own engine. A spectator sends nothing. */
  async send(move: number[]): Promise<void> {
    if (this.current !== 'player') return;
    this.o.transport.send(await this.log.sign(this.o.keys, move));
  }

  private async hello(): Promise<void> {
    const roster = this.o.side === CREATOR ? this.seats.roster() : [];
    this.o.transport.send(await signHello(this.o.keys, { game: this.o.game, seat: this.o.side, roster }));
  }

  private async receive(raw: Wire, peer: string): Promise<void> {
    if ((raw as { kind?: unknown } | null)?.kind === 'hello') return this.receiveHello(parseHello(raw), peer);
    const r = parseRecord(raw);
    if (!r) return this.o.onRefuse('malformed');
    const verdict = await this.log.verify(r);
    if (!verdict.ok) return this.o.onRefuse(verdict.reason);
    const seat = this.seats.seatOf(r.pub);
    if (seat === 0) return this.o.onRefuse('wrong-key');
    if (seat !== this.o.judge.to_move()) return this.o.onRefuse('not-their-turn');
    try {
      this.o.judge.play(Int32Array.from(r.move));
    } catch {
      return this.o.onRefuse('illegal');
    }
    await this.log.append(r);
    this.o.onMove(r.move);
  }

  private async receiveHello(h: Hello | null, peer: string): Promise<void> {
    if (!h || h.game !== this.o.game || !(await verifyHello(h))) return this.o.onRefuse('bad-hello');
    this.presence.hello(peer, h.pub);
    await this.seat(h);
    this.o.onPresence?.();
  }

  private async seat(h: Hello): Promise<void> {
    if (this.o.side === CREATOR) {
      // First valid Hello for a free seat wins. Everyone, the refused included, gets the new roster.
      if (!this.seats.claim(h.seat, h.pub)) this.o.onRefuse('seat-refused');
      return this.hello();
    }
    // Joiners trust the first Hello for seat 1 (the creator) and take the roster from it.
    if (h.seat !== CREATOR || (this.seats.keyOf(CREATOR) !== '' && this.seats.keyOf(CREATOR) !== h.pub)) return;
    if (h.roster[0] !== h.pub || !this.seats.adopt(h.roster)) return;
    const mine = this.seats.seatOf(this.o.keys.pub);
    this.setRole(mine === this.o.side ? 'player' : this.seats.full ? 'spectator' : 'pending');
  }

  private setRole(role: Role): void {
    if (role === this.current) return;
    this.current = role;
    this.o.onRole?.(role);
  }
}

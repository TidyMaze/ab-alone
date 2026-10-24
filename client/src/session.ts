import { MoveLog } from './movelog';
import {
  parseHello,
  parseRecord,
  parseRematch,
  signHello,
  signRematch,
  verifyHello,
  verifyRematch,
  type Hello,
  type Keys,
  type Rematch,
  type Wire,
} from './moverecord';
import { Presence, type Seen } from './presence';
import { colourOf, nextGameId, seatFor } from './rematch';
import { Seats } from './seats';
import type { ConnectionState, Transport } from './transport';

/** The rules engine, the only judge of legality. `play` throws on an illegal move. */
export interface Judge {
  to_move(): number;
  play(mv: Int32Array): void;
  status(): number; // 0 while the game runs
  restart(): void; // a new game from the start position: the rematch
}

const CREATOR = 1; // the room creator holds seat 1 (Black) and decides who gets the others

/** `pending`: asked for a seat, no answer yet. `spectator`: the room is full, we follow but never send. */
export type Role = 'pending' | 'player' | 'spectator';

export interface SessionOptions {
  game: string; // the room: Hello messages are bound to it, and it is the id of its first game
  side: number; // the seat we are or ask for: 1 Black, 2 White in the first game
  seatCount?: number; // seats of the mode, 2 for 1v1
  keys: Keys;
  transport: Transport;
  judge: Judge;
  onMove(move: number[]): void; // a verified, legal move from the other side was applied
  onRefuse(reason: string): void; // a move was refused: shown in the HUD
  onState?(state: ConnectionState): void;
  onRole?(role: Role): void;
  onPresence?(): void; // a key said Hello or its peer left: read presenceOf again
  onRematchAsk?(): void; // a seated key asked for a rematch: read askedRematch again
  onRematch?(): void; // every seat asked: the judge restarted for the new game, read side again
}

/**
 * Sends our moves signed and chained, replays the other side's moves through the engine.
 * Each seat is bound to one key by signed Hello messages: the creator binds the first valid Hello
 * for a free seat and publishes the roster, a move counts only from the key of the side to move.
 * A seat is present while a peer that proved its key is connected.
 * Once a game is over, every seated key may ask for a rematch: a new game on the same channel, with
 * a new id, a fresh log and the colours swapped. The seats stay bound to the same keys.
 */
export class OnlineSession {
  readonly seats: Seats;
  private log: MoveLog;
  private readonly presence = new Presence();
  private queue: Promise<void> = Promise.resolve();
  private current: Role;
  private gameId: string;
  private games = 0; // games of the room before this one: the colours swap at each rematch
  private readonly asks = new Set<string>(); // keys that asked for a rematch of this game

  constructor(private readonly o: SessionOptions) {
    this.gameId = o.game;
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

  /** The id of the game being played: the room id, then a new one at each rematch. */
  get game(): string {
    return this.gameId;
  }

  /** The colour we play in this game, 1 Black or 2 White. */
  get side(): number {
    return colourOf(this.o.side, this.games, this.seats.count);
  }

  /** Whether the key that plays `side` in this game is connected. A free seat is `waiting`. */
  presenceOf(side: number): Seen {
    return this.presence.of(this.keyOf(side));
  }

  /** Whether the key that plays `side` in this game asked for a rematch. */
  askedRematch(side: number): boolean {
    return this.asks.has(this.keyOf(side));
  }

  /** We are a seated player, our turn, the transport is open and the key of every other seat is
   * connected: a move now would reach the opponents, not just any peer such as a spectator (#143). */
  canPlay(): boolean {
    return this.reachesOpponents() && this.o.judge.to_move() === this.side;
  }

  /** Same as canPlay, for a rematch ask: the game is over and we did not ask yet. */
  canRematch(): boolean {
    return this.reachesOpponents() && this.o.judge.status() !== 0 && !this.asks.has(this.o.keys.pub);
  }

  /** Asks for a rematch of the finished game. In the message queue, so a new game that starts now
   * comes before any move of it. Does nothing when canRematch is false. */
  rematch(): Promise<void> {
    this.queue = this.queue.then(async () => {
      if (!this.canRematch()) return;
      this.o.transport.send(await signRematch(this.o.keys, { game: this.gameId }));
      await this.asked(this.o.keys.pub);
    });
    return this.queue;
  }

  /** The caller already applied `move` to its own engine. A spectator sends nothing. */
  async send(move: number[]): Promise<void> {
    if (this.current !== 'player') return;
    this.o.transport.send(await this.log.sign(this.o.keys, move));
  }

  private keyOf(side: number): string {
    return this.seats.keyOf(seatFor(side, this.games, this.seats.count));
  }

  private reachesOpponents(): boolean {
    const others = Array.from({ length: this.seats.count }, (_, i) => i + 1).filter((s) => s !== this.o.side);
    return (
      this.current === 'player' &&
      this.o.transport.state === 'open' &&
      others.every((seat) => this.presence.of(this.seats.keyOf(seat)) === 'here')
    );
  }

  private async hello(): Promise<void> {
    const roster = this.o.side === CREATOR ? this.seats.roster() : [];
    this.o.transport.send(await signHello(this.o.keys, { game: this.o.game, seat: this.o.side, roster }));
  }

  private async receive(raw: Wire, peer: string): Promise<void> {
    const kind = (raw as { kind?: unknown } | null)?.kind;
    if (kind === 'hello') return this.receiveHello(parseHello(raw), peer);
    if (kind === 'rematch') return this.receiveRematch(parseRematch(raw));
    const r = parseRecord(raw);
    if (!r) return this.o.onRefuse('malformed');
    const verdict = await this.log.verify(r);
    if (!verdict.ok) return this.o.onRefuse(verdict.reason);
    const seat = this.seats.seatOf(r.pub);
    if (seat === 0) return this.o.onRefuse('wrong-key');
    if (colourOf(seat, this.games, this.seats.count) !== this.o.judge.to_move()) return this.o.onRefuse('not-their-turn');
    try {
      this.o.judge.play(Int32Array.from(r.move));
    } catch {
      return this.o.onRefuse('illegal');
    }
    await this.log.append(r);
    this.o.onMove(r.move);
    await this.restartIfAgreed(); // the asks may have come before the last move
  }

  private async receiveRematch(r: Rematch | null): Promise<void> {
    if (!r || !(await verifyRematch(r))) return this.o.onRefuse('bad-rematch');
    if (r.game !== this.gameId) return this.o.onRefuse('stale-rematch');
    if (this.seats.seatOf(r.pub) === 0) return this.o.onRefuse('wrong-key');
    await this.asked(r.pub);
  }

  // An ask counts even before the game is over here: on another channel it can overtake the last
  // move. The new game starts only once the game is over here too.
  private async asked(pub: string): Promise<void> {
    this.asks.add(pub);
    this.o.onRematchAsk?.();
    await this.restartIfAgreed();
  }

  private async restartIfAgreed(): Promise<void> {
    if (this.o.judge.status() === 0 || !this.seats.roster().every((pub) => this.asks.has(pub))) return;
    this.gameId = await nextGameId(this.gameId);
    this.games += 1;
    this.log = new MoveLog(this.gameId, this.o.keys.pub);
    this.asks.clear();
    this.o.judge.restart();
    this.o.onRematch?.();
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

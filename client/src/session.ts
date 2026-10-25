import { Coordination } from './coordinator';
import { MoveLog } from './movelog';
import {
  parseCoordinator,
  signCoordinator,
  verifyCoordinator,
  parseHello,
  parseMissed,
  parseRecord,
  parseRematch,
  parseSync,
  signHello,
  signRematch,
  verifyHello,
  verifyRematch,
  type Hello,
  type Keys,
  type Missed,
  type MoveRecord,
  type Coordinator,
  type Rematch,
  type Sync,
  type Wire,
} from './moverecord';
import { Presence, type Seen } from './presence';
import { colourOf, nextGameId, seatFor } from './rematch';
import { Seats } from './seats';
import type { ConnectionState, Transport } from './transport';

/** The rules engine, the only judge of legality. `play` throws on an illegal move. Its `live` is false for a
 * move we missed, replayed from a catch-up answer: the caller shows it without its effects (#232). */
export interface Judge {
  to_move(): number;
  play(mv: Int32Array, live: boolean): void;
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
  agent?: true; // we are an agent player: our Hello carries the signed flag (docs/specs/mcp.md section 8)
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
  /** Heartbeat and coordinator migration (docs/specs/tech.md section 6, #359). `every` runs `fn` each `ms`. Off without it. */
  beat?: { ms: number; now(): number; every(fn: () => void, ms: number): void };
  onCoordinator?(): void; // the coordinator changed or a hand-over progressed: read coordinatorSeq and handover again
}

/** One game of the room: its signed log and the signed rematch asks of it, by key. */
interface Game {
  id: string;
  log: MoveLog;
  asks: Map<string, Rematch>;
}

/**
 * Sends our moves signed and chained, replays the other side's moves through the engine.
 * Each seat is bound to one key by signed Hello messages: the creator binds the first valid Hello
 * for a free seat and publishes the roster, a move counts only from the key of the side to move.
 * A seat is present while a peer that proved its key is connected.
 * Once a game is over, every seated key may ask for a rematch: a new game on the same channel, with
 * a new id, a fresh log and the colours swapped. The seats stay bound to the same keys.
 * After its Hello a peer sends a Sync, and a peer ahead of it answers with the signed records and asks
 * it missed: a peer back after a drop or joining late catches up, an ask lost in a drop included (#198, #226).
 */
export class OnlineSession {
  readonly seats: Seats;
  private readonly presence = new Presence();
  private readonly agents = new Set<string>(); // keys whose verified Hello carried the agent flag
  private queue: Promise<void> = Promise.resolve();
  private current: Role;
  private readonly games: Game[] = []; // every game of the room so far, the one being played last
  private readonly coord: Coordination;
  private readonly order: string[] = []; // the creator's: keys in the order their Hello was first seen
  private migrated = false;
  private syncDue = false; // our Sync waits for the creator's roster: what answers it is checked against the seats

  constructor(private readonly o: SessionOptions) {
    this.games.push(this.newGame(o.game));
    this.seats = new Seats(o.seatCount ?? 2);
    this.current = o.side === CREATOR ? 'player' : 'pending';
    if (o.side === CREATOR) this.seats.claim(CREATOR, o.keys.pub);
    this.coord = new Coordination(o.keys.pub, o.beat?.ms);
    if (o.side === CREATOR) {
      this.order.push(o.keys.pub);
      this.coord.adopt(this.order);
    }
    o.transport.onRecord((m, peer) => {
      // Verification is async: a queue keeps messages handled in arrival order.
      this.queue = this.queue.then(() => this.receive(m, peer));
    });
    // In the same queue: a peer that leaves right after its Hello is gone once both are handled.
    o.transport.onLeave((peer) => {
      this.queue = this.queue.then(() => {
        const key = this.presence.keyOf(peer);
        if (!this.presence.leave(peer)) return;
        o.onPresence?.();
        if (o.beat && this.presence.of(key) !== 'here') return this.moved(this.coord.leave(key));
      });
    });
    o.transport.onState((s) => {
      o.onState?.(s);
      if (s === 'open') this.queue = this.queue.then(() => this.greet());
    });
    if (o.transport.state === 'open') this.queue = this.queue.then(() => this.greet());
    if (o.beat) {
      const { ms, now, every } = o.beat;
      every(() => o.transport.state === 'open' && o.transport.send({ kind: 'beat' }), ms);
      // Checked more often than it beats, so three misses are noticed within a second of the third.
      every(() => (this.queue = this.queue.then(() => this.moved(this.coord.tick(now())))), ms / 5);
    }
  }

  /** The join_seq of the coordinator, from 1, 0 until the creator's order is known. */
  get coordinatorSeq(): number {
    return this.coord.seq;
  }

  get isCoordinator(): boolean {
    return this.coord.coordinator === this.o.keys.pub;
  }

  /** `none` until the coordinator changed, then `pending` until every live peer acknowledged the new one. */
  get handover(): 'none' | 'pending' | 'done' {
    return !this.migrated ? 'none' : this.coord.done ? 'done' : 'pending';
  }

  /** Settles once everything queued so far is handled: messages, leaves, our Hello and Sync, our rematch ask.
   * Something queued meanwhile makes a new promise. Tests wait on it instead of on a time (bug #190). */
  get settled(): Promise<void> {
    return this.queue;
  }

  get role(): Role {
    return this.current;
  }

  /** The id of the game being played: the room id, then a new one at each rematch. */
  get game(): string {
    return this.now.id;
  }

  /** The signed log of the game being played, both sides, oldest first: public keys and signatures only. */
  get signedLog(): MoveRecord[] {
    return this.now.log.from(0);
  }

  /** The colour we play in this game, 1 Black or 2 White. */
  get side(): number {
    return colourOf(this.o.side, this.games.length - 1, this.seats.count);
  }

  /** Whether the key that plays `side` in this game is connected. A free seat is `waiting`. */
  presenceOf(side: number): Seen {
    return this.presence.of(this.keyOf(side));
  }

  /** Whether the key that plays `side` in this game signed its Hello as an agent. */
  isAgent(side: number): boolean {
    return this.agents.has(this.keyOf(side));
  }

  /** Whether the key that plays `side` in this game asked for a rematch. */
  askedRematch(side: number): boolean {
    return this.now.asks.has(this.keyOf(side));
  }

  /** We are a seated player, our turn, the transport is open and the key of every other seat is
   * connected: a move now would reach the opponents, not just any peer such as a spectator (#143). */
  canPlay(): boolean {
    return this.reachesOpponents() && this.o.judge.to_move() === this.side;
  }

  /** Same as canPlay, for a rematch ask: the game is over and we did not ask yet. */
  canRematch(): boolean {
    return this.reachesOpponents() && this.o.judge.status() !== 0 && !this.now.asks.has(this.o.keys.pub);
  }

  /** Asks for a rematch of the finished game. In the message queue, so a new game that starts now
   * comes before any move of it. Does nothing when canRematch is false. */
  rematch(): Promise<void> {
    this.queue = this.queue.then(async () => {
      if (!this.canRematch()) return;
      const ask = await signRematch(this.o.keys, { game: this.now.id });
      this.o.transport.send(ask);
      await this.asked(ask);
    });
    return this.queue;
  }

  /** The caller already applied `move` to its own engine. A spectator sends nothing. */
  async send(move: number[]): Promise<void> {
    if (this.current !== 'player') return;
    this.o.transport.send(await this.now.log.sign(this.o.keys, move));
  }

  private get now(): Game {
    return this.games[this.games.length - 1]!;
  }

  private newGame(id: string): Game {
    return { id, log: new MoveLog(id, this.o.keys.pub), asks: new Map() };
  }

  private known(game: string): boolean {
    return this.games.some((g) => g.id === game);
  }

  private keyOf(side: number): string {
    return this.seats.keyOf(seatFor(side, this.games.length - 1, this.seats.count));
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
    const order = this.o.beat && this.o.side === CREATOR ? [...this.order] : undefined; // the join order, for the coordinator migration
    this.o.transport.send(await signHello(this.o.keys, { game: this.o.game, seat: this.o.side, roster, agent: this.o.agent, order }));
  }

  /** On open: our Hello, then our Sync, so that a peer ahead of us sends what we missed (#226). */
  private async greet(): Promise<void> {
    await this.hello();
    this.sync();
  }

  /** Says which game we are in, how many of its moves we have and whose asks of it. A joiner waits for the
   * creator's roster first: without it, the records that answer would be refused for want of a seat. */
  private sync(): void {
    this.syncDue = this.seats.keyOf(CREATOR) === '';
    if (this.syncDue) return;
    const { id, log, asks } = this.now;
    this.o.transport.send({ kind: 'sync', game: id, seq: log.length, asked: [...asks.keys()] });
  }

  private async receive(raw: Wire, peer: string): Promise<void> {
    const kind = (raw as { kind?: unknown } | null)?.kind;
    if (kind === 'hello') return this.receiveHello(parseHello(raw), peer);
    if (kind === 'beat') return this.receiveBeat(peer);
    if (kind === 'coordinator') return this.receiveCoordinator(parseCoordinator(raw));
    if (kind === 'sync') return this.answer(parseSync(raw), peer);
    if (kind === 'missed') return this.receiveMissed(parseMissed(raw));
    if (kind === 'rematch') return this.receiveRematch(parseRematch(raw), true);
    return this.receiveRecord(parseRecord(raw), true);
  }

  // `live`: sent as it happened, not in answer to our Sync. A live message ahead of what we have shows a
  // gap, so we ask again. An answer never does, so a bad answer cannot make two peers loop (#226).
  private async receiveRecord(r: MoveRecord | null, live: boolean): Promise<void> {
    if (!r) return this.o.onRefuse('malformed');
    const verdict = await this.now.log.verify(r);
    if (!verdict.ok) {
      const ahead = verdict.reason === 'out-of-order' || (verdict.reason === 'wrong-game' && !this.known(r.game));
      if (live && ahead) this.sync();
      return this.o.onRefuse(verdict.reason);
    }
    const seat = this.seats.seatOf(r.pub);
    if (seat === 0) return this.o.onRefuse('wrong-key');
    if (colourOf(seat, this.games.length - 1, this.seats.count) !== this.o.judge.to_move()) return this.o.onRefuse('not-their-turn');
    try {
      this.o.judge.play(Int32Array.from(r.move), live);
    } catch {
      return this.o.onRefuse('illegal');
    }
    await this.now.log.append(r);
    this.o.onMove(r.move);
    await this.restartIfAgreed(); // the asks may have come before the last move
  }

  private async receiveRematch(r: Rematch | null, live: boolean): Promise<void> {
    if (!r || !(await verifyRematch(r))) return this.o.onRefuse('bad-rematch');
    if (r.game !== this.now.id) {
      if (live && !this.known(r.game)) this.sync(); // an ask for a game we never had: we missed a rematch
      return this.o.onRefuse('stale-rematch');
    }
    if (this.seats.seatOf(r.pub) === 0) return this.o.onRefuse('wrong-key');
    await this.asked(r);
  }

  /** A record or an ask we missed: checked exactly as a live one. One we already have came from another
   * peer's answer or live first: skipped without a refusal. */
  private async receiveMissed(m: Missed | null): Promise<void> {
    if (!m) return this.o.onRefuse('malformed');
    if (this.has(m.of)) return;
    return 'kind' in m.of ? this.receiveRematch(m.of, false) : this.receiveRecord(m.of, false);
  }

  private has(x: MoveRecord | Rematch): boolean {
    const game = this.games.find((g) => g.id === x.game);
    if (!game) return false;
    if (game !== this.now) return true; // we left that game: it was over and every seat had asked
    return 'kind' in x ? game.asks.has(x.pub) : x.seq < game.log.length;
  }

  /** Sends a peer behind what it missed, to it alone and once per Sync: the records of its game from its
   * seq and the asks of it it lacks, then every record and ask of each later game. A peer that is not
   * behind gets nothing, nor one in a game we never had (it is ahead of us). */
  private answer(s: Sync | null, peer: string): void {
    if (!s) return this.o.onRefuse('malformed');
    const from = this.games.findIndex((g) => g.id === s.game);
    if (from < 0) return;
    const missed = this.games.slice(from).flatMap((g, i) => [
      ...g.log.from(i === 0 ? s.seq : 0),
      ...[...g.asks.values()].filter((a) => i > 0 || !s.asked.includes(a.pub)),
    ]);
    for (const of of missed) this.o.transport.send({ kind: 'missed', of }, peer);
  }

  // An ask counts even before the game is over here: on another channel it can overtake the last
  // move. The new game starts only once the game is over here too.
  private async asked(r: Rematch): Promise<void> {
    this.now.asks.set(r.pub, r);
    this.o.onRematchAsk?.();
    await this.restartIfAgreed();
  }

  private async restartIfAgreed(): Promise<void> {
    if (this.o.judge.status() === 0 || !this.seats.roster().every((pub) => this.now.asks.has(pub))) return;
    this.games.push(this.newGame(await nextGameId(this.now.id)));
    this.o.judge.restart();
    this.o.onRematch?.();
  }

  private receiveBeat(peer: string): void {
    const key = this.presence.keyOf(peer);
    if (this.o.beat && key !== '') this.coord.beat(key, this.o.beat.now());
  }

  /** The coordinator changed here: tell the caller, and announce ourselves when we are the new one. */
  private async moved(next: string | null): Promise<void> {
    if (next === null) return;
    this.migrated = true;
    this.o.onCoordinator?.();
    if (next !== this.o.keys.pub) this.coord.ack(this.o.keys.pub, next);
    await this.say(next); // the announcement when we are the new coordinator, our acknowledgement when not
  }

  private async say(coordinator: string): Promise<void> {
    this.o.transport.send(await signCoordinator(this.o.keys, { game: this.o.game, coordinator }));
  }

  /** An announcement (the coordinator itself speaks) is followed and acknowledged, an acknowledgement is counted.
   * Only the signed word of a key counts, and only for this room. */
  private async receiveCoordinator(c: Coordinator | null): Promise<void> {
    if (!this.o.beat || !c || c.game !== this.o.game || !(await verifyCoordinator(c))) return;
    if (c.pub !== c.coordinator) {
      this.coord.ack(c.pub, c.coordinator);
    } else if (this.coord.announced(c.pub, this.o.beat.now())) {
      this.migrated = true;
      this.coord.ack(this.o.keys.pub, c.pub);
      await this.say(c.pub);
    } else {
      return;
    }
    this.o.onCoordinator?.();
  }

  private async receiveHello(h: Hello | null, peer: string): Promise<void> {
    if (!h || h.game !== this.o.game || !(await verifyHello(h))) return this.o.onRefuse('bad-hello');
    this.presence.hello(peer, h.pub);
    if (this.o.beat) this.coord.beat(h.pub, this.o.beat.now());
    if (this.o.side === CREATOR && !this.order.includes(h.pub)) this.order.push(h.pub);
    if (h.agent) this.agents.add(h.pub);
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
    if (h.order) this.coord.adopt(h.order);
    const mine = this.seats.seatOf(this.o.keys.pub);
    this.setRole(mine === this.o.side ? 'player' : this.seats.full ? 'spectator' : 'pending');
    if (this.syncDue) this.sync();
  }

  private setRole(role: Role): void {
    if (role === this.current) return;
    this.current = role;
    this.o.onRole?.(role);
  }
}

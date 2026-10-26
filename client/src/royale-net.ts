// The online battle royale (docs/specs/tech.md section 6, #504): the rounds of one room over the session's transport.
// The coordinator only starts rounds; each round is a commit-reveal (royale-round.ts) whose deadline runs from the start
// message as each peer got it; every peer resolves it on its own engine, the empty seats' orders from the same bots, and
// compares the state hash with the other peers'. Pure state, no timer and no clock of its own: the caller passes `now`
// and calls `tick`.
import type { Keys } from './moverecord';
import type { OnlineStatus } from './presence';
import { commitOrder, RoundBook, type Commit, type Reveal } from './royale-round';
import type { Judge } from './session';

/** The round deadline (rules.md section 10.4, OPEN-2): every seat commits within it of the round's start. */
export const ROUND_MS = 15_000;

/** The round deadline of the page: 15 s, or the `round` URL parameter (ms) under navigator.webdriver, so an e2e test
 * plays a round in a second. A player never gets a shortened one. */
export function roundPeriod(search: string, webdriver: boolean): number {
  const ms = Number(new URLSearchParams(search).get('round'));
  return webdriver && Number.isInteger(ms) && ms >= 100 ? ms : ROUND_MS;
}

/** The bots' seed of a room, the same on every peer: FNV-1a of the room id. */
export function seedOf(room: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < room.length; i++) h = Math.imul(h ^ room.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The judge of a royale room's session (session.ts): the rounds carry the orders, a move record never counts there. */
export const ROOM_JUDGE: Judge = {
  to_move: () => 0, // no seat's turn
  play: () => {
    throw new Error('a battle royale room plays no move record');
  },
  status: () => 0,
  restart: () => {},
};

/** The coordinator opens a round. `seats` are the keys by arena seat, '' for a bot: the first start fixes them. */
export interface Start {
  kind: 'start';
  game: string;
  round: number;
  seats: string[];
}
/** A peer lacks the rounds from `round` on: a peer that has them answers with a Played. */
export interface Behind {
  kind: 'behind';
  game: string;
  round: number;
}
/** The signed commits and reveals one peer kept for a round. */
export interface Sealed {
  round: number;
  commits: Commit[];
  reveals: Reveal[];
}
/** The answer to a Behind: the rounds resolved from its round on, and the round open now, to the peer behind alone. */
export interface Played {
  kind: 'played';
  game: string;
  seats: string[];
  rounds: Sealed[];
  open: Sealed | null;
}
/** The state hash after a round, which every peer compares with its own. */
export interface Hash {
  kind: 'hash';
  game: string;
  round: number;
  hash: string;
}
export type RoyaleMessage = Start | Behind | Played | Hash | Commit | Reveal;

const rec = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});
const str = (x: unknown): boolean => typeof x === 'string';
const strs = (x: unknown): boolean => Array.isArray(x) && x.every(str);
const signed = (m: Record<string, unknown>): boolean => str(m.game) && Number.isInteger(m.round) && str(m.pub) && str(m.sig);
const isCommit = (x: unknown): boolean => rec(x).kind === 'commit' && signed(rec(x)) && str(rec(x).hash);
const isReveal = (x: unknown): boolean => {
  const m = rec(x);
  return m.kind === 'reveal' && signed(m) && str(m.nonce) && Array.isArray(m.order) && m.order.every(Number.isInteger);
};
const isSealed = (x: unknown): boolean => {
  const s = rec(x);
  return Number.isInteger(s.round) && Array.isArray(s.commits) && s.commits.every(isCommit) && Array.isArray(s.reveals) && s.reveals.every(isReveal);
};

/** Shape check for a message of the rounds off the wire: the message, or null. */
export function parseRoyale(x: unknown): RoyaleMessage | null {
  const m = rec(x);
  const round = Number.isInteger(m.round);
  const ok =
    str(m.game) &&
    (m.kind === 'start'
      ? round && strs(m.seats)
      : m.kind === 'behind'
        ? round
        : m.kind === 'hash'
          ? round && str(m.hash)
          : m.kind === 'played'
            ? strs(m.seats) && Array.isArray(m.rounds) && m.rounds.every(isSealed) && (m.open === null || isSealed(m.open))
            : isCommit(m) || isReveal(m));
  return ok ? (m as unknown as RoyaleMessage) : null;
}

/** The game as the wasm `Royale` gives it. */
export interface NetGame {
  board(): ArrayLike<number>;
  cracks(): ArrayLike<number>;
  resolve(orders: Int32Array): void;
  bot_order(seat: number): ArrayLike<number>;
  state_hash(): string;
  placement(): ArrayLike<number>;
}

/** `lobby` before the first round, `choosing` while our order can still be committed, `locked` once it is,
 * `waiting` between rounds, past the commit deadline or for a spectator, `over` once the game is. */
export type Phase = 'lobby' | 'choosing' | 'locked' | 'waiting' | 'over';

export interface NetOptions<G extends NetGame> {
  game: string; // the room id, which the commits and reveals are signed for
  keys: Keys;
  royale: G; // a new game of the room's seats and seedOf(game)
  roundMs: number;
  now(): number;
  connected(): boolean; // the transport is open: a round whose deadline passes while it is not waits for a catch-up
  send(message: RoyaleMessage, to?: string): void; // to every peer, or to the one peer `to`
  coordinator(): string; // the key of the coordinator
  roster(): string[]; // the keys by room seat, '' for a free one: the arena seat is the room seat less 1
  onRound?(before: number[], cracks: number[], orders: Int32Array): void; // a round resolved, live: play it out
  onChange?(): void; // the phase, the seats or the desync changed: draw again
}

// A malformed order is a hold, so the engine never refuses the round: a seat count from 1 to 3, a direction from 0 to 5.
const wellFormed = (o: number[]): boolean => o.length === 8 && o[0]! >= 1 && o[0]! <= 3 && o[1]! >= 0 && o[1]! <= 5;

/** The orders of a round from what one peer kept of it, once every deadline passed. */
async function replayed(game: string, s: Sealed, humans: string[]): Promise<number[][]> {
  const book = new RoundBook(game, s.round, humans, Infinity, Infinity);
  for (const c of s.commits) await book.commit(c, 0, c.pub);
  for (const r of s.reveals) await book.reveal(r, 0, r.pub);
  return book.orders(Infinity)!;
}

/**
 * The rounds of one room as one peer sees them. The caller hands it every message of the rounds with the key of the
 * peer it came from, and calls `tick` often (a few times a second): the deadlines pass there.
 * A round opens on the coordinator's start, as it reaches this peer: its seats commit within `roundMs`, then reveal
 * within `roundMs` more (royale-round.ts). A seat with no commit holds. Once the orders are known, the round resolves:
 * the empty seats' orders are the bots', computed from the same state with the same seed on every peer. Then this
 * peer sends its state hash: one that differs from ours is a desync, reported. A peer that sees a start beyond the next
 * round missed some: it says it is behind, and a peer that has them sends the signed commits and reveals of the rounds
 * it missed, which it replays.
 */
export class RoyaleNet<G extends NetGame> {
  seats: string[] | null = null; // keys by arena seat, '' for a bot, from the coordinator's first start
  round = 1; // the round being played
  desync = 0; // the first round after which a peer's state hash differs from ours, 0 while none does
  private book: RoundBook | null = null;
  private kept: Sealed = { round: 0, commits: [], reveals: [] }; // what the book of the open round took
  private mine: Reveal | null = null; // our reveal, sent once the reveal starts
  private committed = false;
  private stale = false; // the open round's deadline passed while we were cut off: only a catch-up resolves it
  private readonly sealed: Sealed[] = []; // what we kept of each resolved round, for a peer behind
  private readonly hashes: string[] = []; // ours after each round
  private heard: Hash[] = []; // the peers' hashes of the rounds we have not resolved yet
  private pending: { m: RoyaleMessage; from: string }[] = []; // messages of a round not open here yet
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly o: NetOptions<G>) {}

  /** Our arena seat, -1 for a spectator. In the lobby, from the roster. */
  get you(): number {
    return this.lineup.indexOf(this.o.keys.pub);
  }

  /** The name of each arena seat: You, a player or a bot. */
  get names(): string[] {
    return this.lineup.map((k, s) => (k === this.o.keys.pub ? 'You' : k ? `Player ${s + 1}` : `Bot ${s + 1}`));
  }

  /** The players in the room: seated keys, in the lobby, then the human seats of the game. */
  get players(): number {
    return this.lineup.filter((k) => k !== '').length;
  }

  get phase(): Phase {
    if (!this.seats) return 'lobby';
    if (this.o.royale.placement().length) return 'over';
    if (!this.book || this.you < 0) return 'waiting';
    if (this.committed) return 'locked';
    return this.book.revealing(this.o.now()) ? 'waiting' : 'choosing';
  }

  /** The coordinator starts the game from the lobby: the keys seated now play, the empty seats are bots. */
  start(): Promise<void> {
    return this.run(async () => {
      if (this.seats || this.o.coordinator() !== this.o.keys.pub) return;
      this.seats = this.o.roster();
      await this.open();
    });
  }

  /** Commits our order for the open round, a move record or [] to hold. Nothing once it is committed or too late. */
  play(order: number[]): Promise<void> {
    return this.run(async () => {
      if (this.phase !== 'choosing') return;
      const { commit, reveal } = await commitOrder(this.o.keys, { game: this.o.game, round: this.round, order });
      if (!(await this.book!.commit(commit, this.o.now(), this.o.keys.pub))) return; // the deadline passed meanwhile
      this.committed = true;
      this.mine = reveal;
      this.kept.commits.push(commit);
      this.o.send(commit);
      this.o.onChange?.();
      await this.step();
    });
  }

  /** A message of the rounds from the peer `peer`, whose Hello proved `from` ('' for none). */
  receive(m: RoyaleMessage, from: string, peer: string): Promise<void> {
    return this.run(() => this.handle(m, from, peer));
  }

  /** Lets the deadlines pass: our reveal once the reveal starts, the round once its orders are known. */
  tick(): Promise<void> {
    return this.run(() => this.step());
  }

  /** Settles once everything queued so far is handled. */
  get settled(): Promise<void> {
    return this.queue;
  }

  private run(fn: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(fn);
    return this.queue;
  }

  private get lineup(): string[] {
    return this.seats ?? this.o.roster();
  }

  private get humans(): string[] {
    return this.seats!.filter((k) => k !== '');
  }

  private async handle(m: RoyaleMessage, from: string, peer: string): Promise<void> {
    if (m.game !== this.o.game) return;
    if (m.kind === 'start') return this.started(m, from);
    if (m.kind === 'behind') return this.answer(m, peer);
    if (m.kind === 'played') return this.catchUp(m);
    if (m.kind === 'hash') return this.compare(m);
    return this.order(m, from);
  }

  private async started(m: Start, from: string): Promise<void> {
    if (from !== this.o.coordinator() || m.seats.length !== this.o.roster().length) return;
    this.seats ??= m.seats;
    if (m.round < this.round || (m.round === this.round && this.book)) return; // a round played or open here
    if (m.round === this.round) return this.openBook();
    this.pending.push({ m, from });
    // The next round while ours is still open is a peer ahead of us by a few messages; anything later, or anything once
    // our round went stale, we missed rounds.
    if (m.round > this.round + (this.book && !this.stale ? 1 : 0)) this.o.send({ kind: 'behind', game: this.o.game, round: this.round });
  }

  private async open(): Promise<void> {
    this.o.send({ kind: 'start', game: this.o.game, round: this.round, seats: this.seats! });
    await this.openBook();
  }

  private async openBook(): Promise<void> {
    const now = this.o.now();
    this.book = new RoundBook(this.o.game, this.round, this.humans, now + this.o.roundMs, now + 2 * this.o.roundMs);
    this.kept = { round: this.round, commits: [], reveals: [] };
    this.committed = false;
    this.stale = false;
    this.mine = null;
    this.o.onChange?.();
    await this.replay();
  }

  /** Hands the messages kept for later to the round that may now be open. */
  private async replay(): Promise<void> {
    const list = this.pending;
    this.pending = [];
    for (const { m, from } of list) await this.handle(m, from, '');
  }

  /** A commit or a reveal: kept by the open round, and then forwarded to every peer (royale-round.ts, #532). */
  private async order(m: Commit | Reveal, from: string): Promise<void> {
    if (m.round < this.round) return;
    if (m.round > this.round || !this.book) return void this.pending.push({ m, from });
    const now = this.o.now();
    if (m.kind === 'commit' ? !(await this.book.commit(m, now, from)) : !(await this.book.reveal(m, now, from))) return;
    if (m.kind === 'commit') this.kept.commits.push(m);
    else this.kept.reveals.push(m);
    this.o.send(m);
    await this.step();
  }

  private async step(): Promise<void> {
    const book = this.book;
    if (!book || this.stale) return;
    const now = this.o.now();
    if (!this.o.connected()) {
      this.stale = book.revealing(now); // what we hear now is not what the others heard by the deadline
      return;
    }
    if (this.mine && book.revealing(now)) {
      const reveal = this.mine;
      this.mine = null;
      await book.reveal(reveal, now, this.o.keys.pub);
      this.kept.reveals.push(reveal);
      this.o.send(reveal);
    }
    const orders = book.orders(now);
    if (!orders) return;
    this.resolve(orders, this.kept, true);
    if (this.o.coordinator() === this.o.keys.pub && this.phase !== 'over') return this.open();
    await this.replay();
  }

  /** Resolves the open round from its orders by human seat, the bots' orders added, and sends our state hash. */
  private resolve(orders: number[][], kept: Sealed, live: boolean): void {
    const game = this.o.royale;
    const humans = this.humans;
    const all: number[] = [];
    this.seats!.forEach((key, seat) => {
      const order = key ? orders[humans.indexOf(key)]! : Array.from(game.bot_order(seat));
      if (wellFormed(order)) all.push(seat, ...order);
    });
    const before = Array.from(game.board());
    const cracks = Array.from(game.cracks());
    game.resolve(Int32Array.from(all));
    this.sealed.push(kept);
    this.book = null;
    this.stale = false;
    const hash = game.state_hash();
    this.hashes.push(hash);
    this.o.send({ kind: 'hash', game: this.o.game, round: this.round, hash });
    this.round++;
    this.check();
    if (live) this.o.onRound?.(before, cracks, Int32Array.from(all));
    this.o.onChange?.();
  }

  private compare(h: Hash): void {
    this.heard.push(h);
    this.check();
    this.o.onChange?.();
  }

  private check(): void {
    for (const h of this.heard) {
      const ours = this.hashes[h.round - 1];
      if (ours !== undefined && ours !== h.hash && this.desync === 0) this.desync = h.round;
    }
    this.heard = this.heard.filter((h) => this.hashes[h.round - 1] === undefined);
  }

  /** A peer behind gets the rounds we resolved from its round on, and what we kept of the round open now. */
  private answer(m: Behind, peer: string): void {
    if (!this.seats || (this.sealed.length < m.round && !this.book)) return;
    const open = this.book ? { ...this.kept, commits: [...this.kept.commits], reveals: [...this.kept.reveals] } : null; // ours grows on
    this.o.send({ kind: 'played', game: this.o.game, seats: this.seats, rounds: this.sealed.slice(m.round - 1), open }, peer);
  }

  /** Replays the rounds we missed, then opens the round open on the peer that answered, with what it kept of it. */
  private async catchUp(m: Played): Promise<void> {
    if (m.seats.length !== this.o.roster().length) return;
    this.seats ??= m.seats;
    const from = this.round;
    for (const s of m.rounds) {
      if (s.round !== this.round || this.phase === 'over') continue;
      this.resolve(await replayed(this.o.game, s, this.humans), s, false);
    }
    if (m.open?.round === this.round && !this.book) {
      await this.openBook();
      for (const c of m.open.commits) await this.order(c, c.pub);
      for (const r of m.open.reveals) await this.order(r, r.pub);
    } else if (this.round > from) await this.replay();
  }
}

/** The HUD status line of an online battle royale (docs/specs/ui.md). The e2e tests read these strings. */
export function netStatus(phase: Phase, coordinating: boolean, players: number, desync: number): OnlineStatus {
  if (desync) return { text: `Desync after round ${desync}: a peer's game differs`, tone: 'gone' };
  const here = `${players} player${players === 1 ? '' : 's'}`;
  if (phase === 'lobby') return { text: coordinating ? `${here} in. Start: bots take the empty seats` : `${here} in. Waiting for the start...`, tone: 'waiting' };
  if (phase === 'choosing') return { text: 'Your order: a move or Hold', tone: 'here' };
  if (phase === 'locked') return { text: 'Order locked, waiting for the others...', tone: 'here' };
  return { text: phase === 'over' ? `${here}, game over` : 'Waiting for the round...', tone: 'watching' };
}

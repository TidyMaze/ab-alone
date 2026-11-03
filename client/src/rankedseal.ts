// How the two seats of a ranked 1v1 produce the `sigs` of a shared result (#1287, docs/specs/multiplayer.md section 7). Pure: it
// builds and checks messages, it sends nothing and reaches no relay.
//   1. Intro: each seat that joined the board tells the other, signed by its GAME key (the seat's identity in this room), which board
//      key and name it plays under. A seat that did not join sends none, so nothing is ever signed with it: both seats opted in or no result.
//   2. Result: once the game is settled, Black signs the result with its board key and sends it with the time it chose; White checks the
//      time against its own clock, rebuilds the same result from ITS log and signs it only if Black's signature verifies on that. A
//      difference in the log, the score or the names gives a signature that fails, and nothing is published.
import { signedBy, b64, ED, type Keys } from './moverecord';
import { MAX_PLIES, bothSigned, signResult, type SharedResult, type Side } from './boardfeed';
import { cleanName } from './shareboard';

const INTRO_TAG = 'ab-alone.seal.v1';
/** How far Black's time may be from White's clock, in seconds. */
export const TS_SLACK_S = 600;

/** A seat's board key and name, signed by its game key. */
export interface Intro {
  readonly kind: 'seal';
  readonly step: 'intro';
  readonly game: string;
  readonly board: string;
  readonly name: string;
  /** The sender's game key. */
  readonly pub: string;
  readonly sig: string;
}

/** A seat's board-key signature of the result (`resultPayload`); Black's carries the time it chose. */
export interface Done {
  readonly kind: 'seal';
  readonly step: 'result';
  readonly game: string;
  readonly ts: number;
  readonly sig: string;
  /** The sender's game key. */
  readonly pub: string;
}

export type Seal = Intro | Done;

/** What a seat knows of the finished game. */
export interface Final {
  readonly moves: number[][];
  readonly status: number;
  readonly ejected: [number, number];
}

const introBytes = (i: Omit<Intro, 'sig'>): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify([INTRO_TAG, i.game, i.board, i.name, i.pub]));

export async function signIntro(keys: Keys, fields: { game: string; board: string; name: string }): Promise<Intro> {
  const unsigned = { kind: 'seal' as const, step: 'intro' as const, ...fields, name: cleanName(fields.name), pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, introBytes(unsigned))) };
}

/** A clean copy of a seal off the wire, or null. */
export function parseSeal(x: unknown): Seal | null {
  const s = x as Record<string, unknown> | null;
  if (typeof s !== 'object' || s === null || s.kind !== 'seal' || typeof s.game !== 'string' || typeof s.pub !== 'string' || typeof s.sig !== 'string') return null;
  if (s.step === 'intro' && typeof s.board === 'string' && typeof s.name === 'string') {
    return { kind: 'seal', step: 'intro', game: s.game, board: s.board, name: s.name, pub: s.pub, sig: s.sig };
  }
  if (s.step === 'result' && Number.isInteger(s.ts)) return { kind: 'seal', step: 'result', game: s.game, ts: s.ts as number, sig: s.sig, pub: s.pub };
  return null;
}

export interface SealOptions {
  readonly game: string;
  /** This seat's colour in this game: 1 Black, 2 White. */
  readonly side: 1 | 2;
  /** This seat's game key. */
  readonly keys: Keys;
  readonly board: Keys;
  readonly name: string;
  /** The other seat's game key. */
  readonly opponent: string;
  readonly nowS: () => number;
}

/** What one message leads to: a message to send, a result both seats signed. */
export interface Step {
  readonly send?: Seal;
  readonly result?: SharedResult;
}

type Their = { board: string; name: string };

export class RankedSeal {
  private theirs: Their | null = null;
  private final: Final | null = null;
  private waiting: Done | null = null; // White: Black's result came before our own log was settled
  private sent = false;
  private ts = 0;
  private mine = '';
  private done = false;

  constructor(private readonly o: SealOptions) {}

  /** Our intro, to send when we play under a board key. */
  intro(): Promise<Intro> {
    return signIntro(this.o.keys, { game: this.o.game, board: this.o.board.pub, name: this.o.name });
  }

  /** The game is settled and both reports agreed: Black may now sign. A log the board would not read (too long) is not offered. */
  finish(final: Final): Promise<Step> {
    if (final.moves.length > MAX_PLIES) return Promise.resolve({});
    this.final = final;
    return this.advance();
  }

  /** A seal from `from`, the game key of the peer that sent it. Anything but the other seat's, for this game, is ignored. */
  async receive(raw: unknown, from: string): Promise<Step> {
    const seal = parseSeal(raw);
    if (!seal || seal.game !== this.o.game || seal.pub !== from || from !== this.o.opponent || this.done) return {};
    if (seal.step === 'intro') {
      if (this.theirs || seal.board === this.o.board.pub || !(await signedBy(seal.pub, seal.sig, introBytes(seal)))) return {};
      this.theirs = { board: seal.board, name: cleanName(seal.name) };
      return this.advance();
    }
    this.waiting = seal;
    return this.advance();
  }

  /** The result as WE read the game, with the time `ts`; only once the intro and the final are in. */
  private build(ts: number): Omit<SharedResult, 'sigs'> {
    const mine: Side = { pub: this.o.board.pub, name: cleanName(this.o.name) };
    const theirs: Side = { pub: this.theirs!.board, name: this.theirs!.name };
    const [black, white] = this.o.side === 1 ? [mine, theirs] : [theirs, mine];
    return { v: 1, game: this.o.game, black, white, ...this.final!, ts };
  }

  private advance(): Promise<Step> {
    return this.final && this.theirs ? (this.o.side === 1 ? this.black() : this.white()) : Promise.resolve({});
  }

  /** Black signs once and sends; White's answer completes the result. */
  private async black(): Promise<Step> {
    if (!this.sent) {
      this.sent = true;
      const r = this.build(this.o.nowS());
      this.ts = r.ts;
      this.mine = await signResult(this.o.board, r);
      return { send: { kind: 'seal', step: 'result', game: this.o.game, ts: r.ts, sig: this.mine, pub: this.o.keys.pub } };
    }
    const their = this.waiting;
    if (!their) return {};
    this.waiting = null;
    const full: SharedResult = { ...this.build(this.ts), sigs: { black: this.mine, white: their.sig } };
    if (!(await bothSigned(full))) return {};
    this.done = true;
    return { result: full };
  }

  /** White signs only what Black's signature verifies on, rebuilt from its own log. */
  private async white(): Promise<Step> {
    const their = this.waiting;
    if (!their || Math.abs(their.ts - this.o.nowS()) > TS_SLACK_S) return {};
    this.waiting = null;
    const r = this.build(their.ts);
    const mine = await signResult(this.o.board, r);
    const full: SharedResult = { ...r, sigs: { black: their.sig, white: mine } };
    if (!(await bothSigned(full))) return {};
    this.done = true;
    return { send: { kind: 'seal', step: 'result', game: this.o.game, ts: r.ts, sig: mine, pub: this.o.keys.pub }, result: full };
  }
}

// The read side of the shared ranked board (#1287, docs/specs/multiplayer.md section 7). It only reads: one REQ per relay, never an EVENT.
// A result is shown only if the Rust rules replay its move log to the same status and ejections (`replay_score`, crates/edgefall-wasm);
// ratings are derived from the valid results, never read. A result also needs the signature of BOTH seats over the game (#1317),
// proved with the seats' keys: the Nostr signature of the event proves nothing about who played, so it is not checked.
import banned from './bannedkeys.json';
import banSig from './bannedkeys.sig.json';
import { verifyBanList } from './banverify';
import { DEFAULT_RATING, MIN_RATING, update1v1Elo } from './elo';
import { b64, signedBy, type Keys } from './moverecord';
import { cleanName, verifyRetire, type RetireEvent } from './shareboard';

// The two relays the board reads (#1287, docs/specs/multiplayer.md 7).
export const RELAYS = ['wss://relay.piazza.today', 'wss://relay.bitmacro.cloud'] as const;
export const WINDOW_S = 7 * 24 * 3600;
const CLOCK_SLACK_S = 600;
export const LIMIT = 200;
const TIMEOUT_MS = 8000;
const SUB = 'ab-board';
export const TAG = 'ab-alone-ranked'; // kept after the rename to Edgefall: the published results stay on the board (#1651)
export const MAX_PLIES = 1000;
/** The plies replayed in one read at most, whatever the relays send: a stranger cannot make the page replay for long. */
export const REPLAY_BUDGET = 20_000;
/** One banned key of `bannedkeys.json`: a PR to that file bans a key, with a reason and a date (docs/specs/multiplayer.md section 7). */
export interface BanEntry {
  readonly pub: string;
  readonly reason: string;
  readonly date: string;
}
export const banSet = (list: readonly BanEntry[]): ReadonlySet<string> => new Set(list.map((b) => b.pub));
/** The banned keys of the shipped list, once its owner signature is checked (`banverify.ts`): none when it does not verify. */
export const BANNED: Promise<ReadonlySet<string>> = verifyBanList(banned, banSig);
/** The plies replayed for results that do NOT replay to their claim, kept apart so junk cannot use up the honest budget; and how many such
 * results one key may have before its events are no longer replayed. */
export const JUNK_BUDGET = 20_000;
export const MAX_FAILS_PER_KEY = 2;
const STRIDE = 8; // integers per move record, crates/edgefall-wasm/src/lib.rs

export interface Side {
  readonly pub: string;
  readonly name: string;
}

/** The `content` of a ranked event: the game, both seats, the move records, and the status and ejections the writer claims. */
export interface SharedResult {
  readonly v: 1;
  readonly game: string;
  readonly black: Side;
  readonly white: Side;
  readonly moves: number[][];
  /** 1 Black won, 2 White won, 3 draw. */
  readonly status: number;
  readonly ejected: [number, number];
  /** Seconds since 1970. */
  readonly ts: number;
  /** Each seat's Ed25519 signature (base64url) of `resultPayload`: its key, the opponent's, the names, the log, the score and the time. */
  readonly sigs: { readonly black: string; readonly white: string };
}

export interface SharedRow {
  readonly rank: number;
  readonly pub: string;
  readonly name: string;
  readonly rating: number;
}

/** `replay_score` of the wasm bridge: `[status, black ejections, white ejections]`, empty when the log does not replay. */
export type Score = (flat: Int32Array) => Uint8Array;

/** The part of a WebSocket used here, so the tests stub it and never reach a relay. */
export interface Socket {
  addEventListener(type: string, fn: (e: { data?: string }) => void): void;
  send(data: string): void;
  close(): void;
}

const isSide = (x: unknown): x is Side => {
  const s = x as Side | null;
  return !!s && typeof s.pub === 'string' && s.pub.length <= MAX_ID && typeof s.name === 'string';
};
const isMove = (m: unknown): m is number[] => Array.isArray(m) && m.length === STRIDE && m.every((n) => Number.isInteger(n) && n === (n | 0)); // int32, as the rules engine reads them
/** The longest key or game id a result may carry (a key is 43 characters). */
const MAX_ID = 64;

/** The bytes both seats sign: the game, both keys and names, a SHA-256 of the move log, the score and the time. A seat that signs this
 * has agreed to be that key, under that name, in that game, with that outcome. A refusal to sign gives no result at all: an unsigned
 * game is not rated and there is no forfeit (a one-sided claim of a refusal would let a winner invent one). */
export async function resultPayload(r: Omit<SharedResult, 'sigs'>): Promise<Uint8Array<ArrayBuffer>> {
  const log = new TextEncoder().encode(JSON.stringify(r.moves));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', log)), (b) => b.toString(16).padStart(2, '0')).join('');
  return new TextEncoder().encode(JSON.stringify(['ab-alone.result.v1', r.v, r.game, r.black.pub, cleanName(r.black.name), r.white.pub, cleanName(r.white.name), hash, r.status, r.ejected, r.ts]));
}

/** One seat's signature of the result, base64url. */
export async function signResult(keys: Keys, r: Omit<SharedResult, 'sigs'>): Promise<string> {
  return b64(await crypto.subtle.sign({ name: 'Ed25519' }, keys.priv, await resultPayload(r)));
}

/** Whether black's key signed the result as black and white's key as white. Anything else is false. */
export async function bothSigned(r: SharedResult): Promise<boolean> {
  const bytes = await resultPayload(r);
  return (await signedBy(r.black.pub, r.sigs.black, bytes)) && (await signedBy(r.white.pub, r.sigs.white, bytes));
}

/** A result from an event's content, or null when it is not a finished 1v1 result of this format. */
export function parseResult(content: string): SharedResult | null {
  let x: Partial<SharedResult> | null;
  try {
    x = JSON.parse(content) as Partial<SharedResult> | null;
  } catch {
    return null;
  }
  if (!x || x.v !== 1 || typeof x.game !== 'string' || x.game.length > MAX_ID || !isSide(x.black) || !isSide(x.white) || x.black.pub === x.white.pub) return null;
  if (!Array.isArray(x.moves) || x.moves.length > MAX_PLIES || !x.moves.every(isMove)) return null;
  if (x.status !== 1 && x.status !== 2 && x.status !== 3) return null;
  if (!Array.isArray(x.ejected) || x.ejected.length !== 2 || !x.ejected.every((n) => Number.isInteger(n))) return null;
  if (typeof x.ts !== 'number' || !Number.isFinite(x.ts) || Math.abs(x.ts) > 2 ** 40) return null;
  if (!x.sigs || typeof x.sigs.black !== 'string' || typeof x.sigs.white !== 'string') return null;
  return {
    sigs: { black: x.sigs.black, white: x.sigs.white },
    v: 1, game: x.game, moves: x.moves, status: x.status, ejected: x.ejected as [number, number], ts: x.ts,
    black: { pub: x.black.pub, name: cleanName(x.black.name) },
    white: { pub: x.white.pub, name: cleanName(x.white.name) },
  };
}

/** The retire time of each key that sent a `RetireEvent` signed by itself (what `leaveBoard` and `newKey` store and publish): the earliest
 * if it sent several. A retire not signed by its own key counts for nothing. Results of that key dated after it are hidden, earlier ones stay. */
export async function retireTimes(contents: readonly string[]): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  for (const content of contents) {
    let e: Partial<RetireEvent> | null;
    try {
      e = JSON.parse(content) as Partial<RetireEvent> | null;
    } catch {
      continue;
    }
    if (e?.v !== 1 || e.kind !== 'retire' || typeof e.pub !== 'string' || typeof e.sig !== 'string' || typeof e.at !== 'number' || !Number.isFinite(e.at)) continue;
    if (e.at >= (times.get(e.pub) ?? Infinity) || !(await verifyRetire(e as RetireEvent))) continue;
    times.set(e.pub, e.at);
  }
  return times;
}

/** A time chosen by the players is believed only inside the window the relays are asked for (and 10 minutes of clock slack): nobody orders
 * their games last, nor brings an old game back with a new date, and a result outside it is not even replayed. */
const inWindow = (ts: number, nowS: number): boolean => ts >= nowS - WINDOW_S && ts <= nowS + CLOCK_SLACK_S;

/** The results both seats signed whose log the rules replay to the claimed score, one per game and pair of seats (the first seen). The rest is not shown.
 * A result with a bad signature is dropped before the replay and does not use up its game id, so nobody can squat a game. */
export async function verifiedResults(contents: readonly string[], score: Score, nowS: number, ban?: ReadonlySet<string>): Promise<SharedResult[]> {
  const bans = ban ?? (await BANNED);
  const seen = new Set<string>(); // every (game, black, white) met, a refused one too: a game is replayed once. The seats are in the key so that
  // another pair of keys reusing a public game id cannot spend it.
  const kept: SharedResult[] = [];
  const retired = await retireTimes(contents);
  let budget = REPLAY_BUDGET;
  let junk = JUNK_BUDGET;
  const fails = new Map<string, number>(); // refused replays by key (either seat)
  // The shortest logs first (stable, so the first seen still wins a tie): a flood of long junk cannot come before the games people play.
  const parsed = contents.flatMap((c) => parseResult(c) ?? []).filter((r) => inWindow(r.ts, nowS)).sort((a, b) => a.moves.length - b.moves.length);
  for (const r of parsed) {
    if (bans.has(r.black.pub) || bans.has(r.white.pub)) continue; // a banned key's results are ignored
    if (r.ts > (retired.get(r.black.pub) ?? Infinity) || r.ts > (retired.get(r.white.pub) ?? Infinity)) continue; // a key stopped before this game
    const id = JSON.stringify([r.game, r.black.pub, r.white.pub]);
    if (seen.has(id) || r.moves.length > budget || r.moves.length > junk || !(await bothSigned(r))) continue;
    if ((fails.get(r.black.pub) ?? 0) >= MAX_FAILS_PER_KEY || (fails.get(r.white.pub) ?? 0) >= MAX_FAILS_PER_KEY) continue;
    seen.add(id);
    const got = score(Int32Array.from(r.moves.flat()));
    if (got.length === 3 && got[0] === r.status && got[1] === r.ejected[0] && got[2] === r.ejected[1]) {
      budget -= r.moves.length; // only a replay that held uses the honest budget
      kept.push(r);
    } else {
      junk -= r.moves.length;
      for (const pub of [r.black.pub, r.white.pub]) fails.set(pub, (fails.get(pub) ?? 0) + 1);
    }
  }
  return kept;
}

/** A key is ranked only after this many counted games (ranked F3): a throwaway key must play before it shows. */
export const MIN_GAMES = 10;
/** A rating change is scaled by the games the OPPONENT had counted before, over this many, at most 1: beating a fresh key gains nothing. */
export const RAMP_GAMES = 10;

/** At most this many results count for one unordered pair of keys in one UTC day: throwaway keys cannot farm each other. */
export const PAIR_DAY_CAP = 3;
/** A key is ranked only after counted results against this many distinct opponent keys. */
export const MIN_OPPONENTS = 5;

/** The results in order (time, then game) without the ones past `PAIR_DAY_CAP` for their pair of keys and UTC day: the first ones count. */
export function capPairs(results: readonly SharedResult[]): SharedResult[] {
  const count = new Map<string, number>();
  return [...results]
    .sort((a, b) => a.ts - b.ts || a.game.localeCompare(b.game))
    .filter((r) => {
      const key = JSON.stringify([[r.black.pub, r.white.pub].sort(), Math.floor(r.ts / 86400)]);
      const n = (count.get(key) ?? 0) + 1;
      count.set(key, n);
      return n <= PAIR_DAY_CAP;
    });
}

/** Every rating from the valid results in order (time, then game), from the default rating: a rating anyone could write is never read.
 * The pair cap applies; only keys with counted results against `minOpponents` distinct opponents get a row. */
export function deriveBoard(results: readonly SharedResult[], minOpponents = MIN_OPPONENTS, minGames = MIN_GAMES, ramp = RAMP_GAMES): SharedRow[] {
  const ratings = new Map<string, number>();
  const names = new Map<string, string>();
  const opponents = new Map<string, Set<string>>();
  const games = new Map<string, number>(); // counted games so far, by key
  const weight = (opponent: string): number => (ramp > 0 ? Math.min(1, (games.get(opponent) ?? 0) / ramp) : 1);
  const met = (a: string, b: string): void => void opponents.set(a, (opponents.get(a) ?? new Set<string>()).add(b));
  for (const r of capPairs(results)) {
    const a = ratings.get(r.black.pub) ?? DEFAULT_RATING;
    const b = ratings.get(r.white.pub) ?? DEFAULT_RATING;
    const next = update1v1Elo(a, b, { 1: 1, 2: 0, 3: 0.5 }[r.status]!);
    ratings.set(r.black.pub, Math.max(MIN_RATING, a + Math.round(next.deltaA * weight(r.white.pub))));
    ratings.set(r.white.pub, Math.max(MIN_RATING, b + Math.round(next.deltaB * weight(r.black.pub))));
    games.set(r.black.pub, (games.get(r.black.pub) ?? 0) + 1);
    games.set(r.white.pub, (games.get(r.white.pub) ?? 0) + 1);
    names.set(r.black.pub, r.black.name);
    names.set(r.white.pub, r.white.name);
    met(r.black.pub, r.white.pub);
    met(r.white.pub, r.black.pub);
  }
  return [...ratings]
    .filter(([pub]) => opponents.get(pub)!.size >= minOpponents && games.get(pub)! >= minGames)
    .map(([pub, rating]) => ({ pub, name: names.get(pub)!, rating }))
    .sort((a, b) => b.rating - a.rating || (a.name < b.name ? -1 : 1))
    .map((r, i) => ({ rank: i + 1, ...r }));
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** The rows as a table, names escaped (they come from strangers), my key marked. */
export function sharedHtml(rows: readonly SharedRow[], myPub: string): string {
  if (!rows.length) return '<p>No replayed result on the relays in the last 7 days.</p>';
  const body = rows
    .map((r) => `<tr${r.pub === myPub ? ' data-me="true" aria-current="true"' : ''}><td>${r.rank}</td><td>${escape(r.name)}</td><td>${r.rating}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>#</th><th>Player</th><th>Rating</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** The contents of the ranked events one relay holds (last 7 days, 200 at most). Ends at EOSE, CLOSED, a rate limit notice, an error, a close or 8 s. */
export function readRelay(open: (url: string) => Socket, nowS: number, url = ''): Promise<string[]> {
  return new Promise((resolve) => {
    const contents: string[] = [];
    let sock: Socket;
    try {
      sock = open(url);
    } catch {
      resolve(contents);
      return;
    }
    let asked = false;
    let over = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (): void => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      if (asked) sock.send(JSON.stringify(['CLOSE', SUB]));
      sock.close();
      resolve(contents);
    };
    timer = setTimeout(end, TIMEOUT_MS);
    sock.addEventListener('open', () => {
      asked = true;
      sock.send(JSON.stringify(['REQ', SUB, { kinds: [1], '#t': [TAG], since: nowS - WINDOW_S, limit: LIMIT }]));
    });
    sock.addEventListener('message', (e) => {
      if (over) return;
      let m: unknown;
      try {
        m = JSON.parse(e.data!);
      } catch {
        return;
      }
      if (!Array.isArray(m)) return;
      if (m[0] === 'EOSE' || m[0] === 'CLOSED' || (m[0] === 'NOTICE' && String(m[1]).startsWith('rate-limited'))) end();
      else if (m[0] === 'EVENT' && m[1] === SUB) {
        const ev = m[2] as { kind?: number; tags?: unknown; content?: unknown } | null;
        const tagged = Array.isArray(ev?.tags) && (ev.tags as unknown[][]).some((t) => t[0] === 't' && t[1] === TAG);
        if (ev?.kind === 1 && tagged && typeof ev.content === 'string') contents.push(ev.content);
      }
    });
    for (const type of ['error', 'close']) sock.addEventListener(type, end);
  });
}

/** The board: the three relays read, the results that replay kept, the ratings derived. Reads only. */
export async function readBoard(open: (url: string) => Socket, nowS: number, score: Score, relays: readonly string[] = RELAYS, ban?: ReadonlySet<string>, minOpponents = MIN_OPPONENTS, minGames = MIN_GAMES, ramp = RAMP_GAMES): Promise<SharedRow[]> {
  // one relay down (a rejected read) does not stop the others: allSettled, the rejected ones give nothing
  const all = await Promise.allSettled(relays.map((url) => readRelay(open, nowS, url)));
  const got = all.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return deriveBoard(await verifiedResults(got, score, nowS, ban), minOpponents, minGames, ramp);
}

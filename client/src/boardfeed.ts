// The read side of the shared ranked board (#1287, docs/specs/multiplayer.md section 7). It only reads: one REQ per relay, never an EVENT.
// A result is shown only if the Rust rules replay its move log to the same status and ejections (`replay_score`, crates/abalone-wasm);
// ratings are derived from the valid results, never read. A result also needs the signature of BOTH seats over the game (#1317),
// proved with the seats' keys: the Nostr signature of the event proves nothing about who played, so it is not checked.
import { DEFAULT_RATING, update1v1Elo } from './elo';
import { b64, signedBy, type Keys } from './moverecord';
import { cleanName } from './shareboard';

export const RELAYS = ['wss://nos.lol', 'wss://relay.piazza.today', 'wss://relay.bitmacro.cloud'] as const;
export const WINDOW_S = 7 * 24 * 3600;
export const LIMIT = 200;
const TIMEOUT_MS = 8000;
const SUB = 'ab-board';
const TAG = 'ab-alone-ranked';
export const MAX_PLIES = 1000;
/** The plies replayed in one read at most, whatever the relays send: a stranger cannot make the page replay for long. */
export const REPLAY_BUDGET = 20_000;
const STRIDE = 8; // integers per move record, crates/abalone-wasm/src/lib.rs

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
  return !!s && typeof s.pub === 'string' && typeof s.name === 'string';
};
const isMove = (m: unknown): m is number[] => Array.isArray(m) && m.length === STRIDE && m.every((n) => Number.isInteger(n));

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
  if (!x || x.v !== 1 || typeof x.game !== 'string' || !isSide(x.black) || !isSide(x.white) || x.black.pub === x.white.pub) return null;
  if (!Array.isArray(x.moves) || x.moves.length > MAX_PLIES || !x.moves.every(isMove)) return null;
  if (x.status !== 1 && x.status !== 2 && x.status !== 3) return null;
  if (!Array.isArray(x.ejected) || x.ejected.length !== 2 || !x.ejected.every((n) => Number.isInteger(n))) return null;
  if (typeof x.ts !== 'number' || !Number.isFinite(x.ts)) return null;
  if (!x.sigs || typeof x.sigs.black !== 'string' || typeof x.sigs.white !== 'string') return null;
  return {
    sigs: { black: x.sigs.black, white: x.sigs.white },
    v: 1, game: x.game, moves: x.moves, status: x.status, ejected: x.ejected as [number, number], ts: x.ts,
    black: { pub: x.black.pub, name: cleanName(x.black.name) },
    white: { pub: x.white.pub, name: cleanName(x.white.name) },
  };
}

/** The results both seats signed whose log the rules replay to the claimed score, one per game (the first seen). The rest is not shown.
 * A result with a bad signature is dropped before the replay and does not use up its game id, so nobody can squat a game. */
export async function verifiedResults(contents: readonly string[], score: Score): Promise<SharedResult[]> {
  const seen = new Set<string>(); // every game id met, a refused one too: a game is replayed once
  const kept: SharedResult[] = [];
  let budget = REPLAY_BUDGET;
  for (const content of contents) {
    const r = parseResult(content);
    if (!r || seen.has(r.game) || r.moves.length > budget || !(await bothSigned(r))) continue;
    seen.add(r.game);
    budget -= r.moves.length;
    const got = score(Int32Array.from(r.moves.flat()));
    if (got.length === 3 && got[0] === r.status && got[1] === r.ejected[0] && got[2] === r.ejected[1]) kept.push(r);
  }
  return kept;
}

/** Every rating from the valid results in order (time, then game), from the default rating: a rating anyone could write is never read. */
export function deriveBoard(results: readonly SharedResult[]): SharedRow[] {
  const ratings = new Map<string, number>();
  const names = new Map<string, string>();
  const ordered = [...results].sort((a, b) => a.ts - b.ts || a.game.localeCompare(b.game));
  for (const r of ordered) {
    const a = ratings.get(r.black.pub) ?? DEFAULT_RATING;
    const b = ratings.get(r.white.pub) ?? DEFAULT_RATING;
    const next = update1v1Elo(a, b, { 1: 1, 2: 0, 3: 0.5 }[r.status]!);
    ratings.set(r.black.pub, next.ratingA);
    ratings.set(r.white.pub, next.ratingB);
    names.set(r.black.pub, r.black.name);
    names.set(r.white.pub, r.white.name);
  }
  return [...ratings]
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
export async function readBoard(open: (url: string) => Socket, nowS: number, score: Score, relays: readonly string[] = RELAYS): Promise<SharedRow[]> {
  const all = await Promise.all(relays.map((url) => readRelay(open, nowS, url)));
  return deriveBoard(await verifiedResults(all.flat(), score));
}

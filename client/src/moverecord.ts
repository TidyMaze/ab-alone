// A move record is one signed link of the game log: {game, seq, prev, move, pub, sig}. `prev` is the
// SHA-256 of the previous record, so the log is tamper evident (docs/specs/tech.md section 6).
// Signatures are Ed25519 from Web Crypto. Keys and signatures travel as base64url strings.
import type { RoyaleMessage } from './royale-net';

export interface MoveRecord {
  game: string;
  seq: number;
  prev: string;
  move: number[];
  pub: string;
  sig: string;
}

export interface Keys {
  priv: CryptoKey;
  pub: string;
}

/** `prev` of the first record of a game. */
export const GENESIS = '0'.repeat(64);

export const ED = { name: 'Ed25519' } as const;

export const b64 = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
export const unb64 = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Join message: the sender's key and the seat it asks for. The creator's Hello also carries the roster, the keys by seat. */
export interface Hello {
  kind: 'hello';
  game: string;
  seat: number;
  roster: string[];
  agent?: true; // an agent player (docs/specs/mcp.md section 8): signed, absent means a human
  order?: string[]; // the creator's: every key in the order its Hello was first seen, so join_seq is the same everywhere (#359)
  engine?: number; // `engine_version()` of the sender's wasm (#526), absent from a peer older than it
  pub: string;
  sig: string;
}

/** Ask for a rematch of the finished game `game`, signed by a seated key (docs/specs/tech.md section 6). */
export interface Rematch {
  kind: 'rematch';
  game: string;
  pub: string;
  sig: string;
}

/** What one player says of a finished 1v1 ranked game, signed by that player's key (#1317): the board hash it ended on,
 * the status it reads (1 or 2 the winner's colour, 3 a draw), its own colour and its own rating. */
export interface Report {
  kind: 'report';
  game: string;
  hash: string;
  status: number;
  side: number;
  rating: number;
  pub: string;
  sig: string;
}

/** Catch-up request, sent after Hello (docs/specs/tech.md section 6, Reconnection, #226): the game of the room
 * the sender is in, how many of its moves it has, and the keys whose rematch ask of it it holds. Not signed:
 * it changes nothing, and everything that answers it is signed. */
export interface Sync {
  kind: 'sync';
  game: string;
  seq: number;
  asked: string[];
}

/** One signed move record or rematch ask that a peer behind missed, sent to it alone in answer to its Sync. */
export interface Missed {
  kind: 'missed';
  of: MoveRecord | Rematch;
}

/** Heartbeat (docs/specs/tech.md section 6, #359): proves the sender is alive. Not signed, it changes nothing but a timer. */
export interface Beat {
  kind: 'beat';
}

/** A key says `coordinator` coordinates the room now. The coordinator itself sending it is the announcement, any other
 * key is its acknowledgement. Signed, so a peer cannot speak for another. */
export interface Coordinator {
  kind: 'coordinator';
  game: string;
  coordinator: string;
  pub: string;
  sig: string;
}

/** Anything a transport carries: the messages of the battle royale rounds too (royale-net.ts, #504). */
export type Wire = MoveRecord | Hello | Rematch | Report | Sync | Missed | Beat | Coordinator | RoyaleMessage;

type Unsigned = Omit<MoveRecord, 'sig'>;

// Fixed field order, so both peers hash and verify the same bytes.
const payload = (r: Unsigned): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify([r.game, r.seq, r.prev, r.move, r.pub]));

// The agent, order and engine entries are added only when set, so a Hello without them keeps the bytes older peers verify.
const helloPayload = (h: Omit<Hello, 'sig'>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(['hello', h.game, h.seat, h.roster, h.pub, ...(h.agent ? ['agent'] : []), ...(h.order ? ['order', h.order] : []), ...(h.engine === undefined ? [] : ['engine', h.engine])]));
const coordinatorPayload = (c: Omit<Coordinator, 'sig'>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(['coordinator', c.game, c.coordinator, c.pub]));

const rematchPayload = (r: Omit<Rematch, 'sig'>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(['rematch', r.game, r.pub]));

const reportPayload = (r: Omit<Report, 'sig'>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(['report', r.game, r.hash, r.status, r.side, r.rating, r.pub]));

/** Whether `sig` is `pub`'s signature of `bytes`. Malformed base64 or key bytes are a refusal, never a throw. */
export async function signedBy(pub: string, sig: string, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', unb64(pub), ED, false, ['verify']);
    return await crypto.subtle.verify(ED, key, unb64(sig), bytes);
  } catch {
    return false;
  }
}

async function keysFrom(priv: CryptoKey, publicKey: CryptoKey): Promise<Keys> {
  return { priv, pub: b64(await crypto.subtle.exportKey('raw', publicKey)) };
}

/** A fresh key pair per game and per tab: two tabs of one browser must never share an identity. */
export async function generateKeys(): Promise<Keys> {
  const pair = (await crypto.subtle.generateKey(ED, true, ['sign', 'verify'])) as CryptoKeyPair;
  return keysFrom(pair.privateKey, pair.publicKey);
}

export async function signMove(
  keys: Keys,
  fields: { game: string; seq: number; prev: string; move: number[] },
): Promise<MoveRecord> {
  const unsigned = { ...fields, pub: keys.pub };
  const sig = await crypto.subtle.sign(ED, keys.priv, payload(unsigned));
  return { ...unsigned, sig: b64(sig) };
}

export async function signHello(
  keys: Keys,
  fields: { game: string; seat: number; roster: string[]; agent?: true; order?: string[]; engine?: number },
): Promise<Hello> {
  const unsigned = { kind: 'hello' as const, ...fields, pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, helloPayload(unsigned))) };
}

export async function signCoordinator(keys: Keys, fields: { game: string; coordinator: string }): Promise<Coordinator> {
  const unsigned = { kind: 'coordinator' as const, ...fields, pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, coordinatorPayload(unsigned))) };
}

export function verifyCoordinator(c: Coordinator): Promise<boolean> {
  return signedBy(c.pub, c.sig, coordinatorPayload(c));
}

export function verifyHello(h: Hello): Promise<boolean> {
  return signedBy(h.pub, h.sig, helloPayload(h));
}

export async function signRematch(keys: Keys, fields: { game: string }): Promise<Rematch> {
  const unsigned = { kind: 'rematch' as const, ...fields, pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, rematchPayload(unsigned))) };
}

export async function signReport(keys: Keys, fields: Omit<Report, 'kind' | 'pub' | 'sig'>): Promise<Report> {
  const unsigned = { kind: 'report' as const, ...fields, pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, reportPayload(unsigned))) };
}

export function verifyReport(r: Report): Promise<boolean> {
  return signedBy(r.pub, r.sig, reportPayload(r));
}

export function verifyRematch(r: Rematch): Promise<boolean> {
  return signedBy(r.pub, r.sig, rematchPayload(r));
}

export function verifyRecord(r: MoveRecord): Promise<boolean> {
  return signedBy(r.pub, r.sig, payload(r));
}

/** Hash of the whole record, signature included: the next record's `prev`. */
export async function hashRecord(r: MoveRecord): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([r.game, r.seq, r.prev, r.move, r.pub, r.sig]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Shape check for anything that came off the wire. Returns a clean copy or null. */
export function parseRecord(x: unknown): MoveRecord | null {
  if (typeof x !== 'object' || x === null) return null;
  const r = x as Record<string, unknown>;
  const ok =
    typeof r.game === 'string' &&
    Number.isInteger(r.seq) &&
    (r.seq as number) >= 0 &&
    typeof r.prev === 'string' &&
    Array.isArray(r.move) &&
    r.move.every((n) => typeof n === 'number') &&
    typeof r.pub === 'string' &&
    typeof r.sig === 'string';
  if (!ok) return null;
  return { game: r.game as string, seq: r.seq as number, prev: r.prev as string, move: r.move as number[], pub: r.pub as string, sig: r.sig as string };
}

/** Shape check for a Hello off the wire. Returns a clean copy or null. */
export function parseHello(x: unknown): Hello | null {
  if (typeof x !== 'object' || x === null) return null;
  const h = x as Record<string, unknown>;
  const ok =
    h.kind === 'hello' &&
    typeof h.game === 'string' &&
    Number.isInteger(h.seat) &&
    (h.seat as number) >= 1 &&
    Array.isArray(h.roster) &&
    h.roster.every((k) => typeof k === 'string') &&
    (h.agent === undefined || h.agent === true) &&
    (h.order === undefined || (Array.isArray(h.order) && h.order.every((k) => typeof k === 'string'))) &&
    (h.engine === undefined || Number.isInteger(h.engine)) &&
    typeof h.pub === 'string' &&
    typeof h.sig === 'string';
  if (!ok) return null;
  return {
    kind: 'hello',
    game: h.game as string,
    seat: h.seat as number,
    roster: h.roster as string[],
    ...(h.agent ? { agent: true as const } : {}),
    ...(h.order ? { order: h.order as string[] } : {}),
    ...(h.engine === undefined ? {} : { engine: h.engine as number }),
    pub: h.pub as string,
    sig: h.sig as string,
  };
}

/** Shape check for a Rematch off the wire. Returns a clean copy or null. */
export function parseRematch(x: unknown): Rematch | null {
  if (typeof x !== 'object' || x === null) return null;
  const r = x as Record<string, unknown>;
  const ok = r.kind === 'rematch' && typeof r.game === 'string' && typeof r.pub === 'string' && typeof r.sig === 'string';
  return ok ? { kind: 'rematch', game: r.game as string, pub: r.pub as string, sig: r.sig as string } : null;
}

/** Shape check for a Report off the wire. Returns a clean copy or null. */
export function parseReport(x: unknown): Report | null {
  if (typeof x !== 'object' || x === null) return null;
  const r = x as Record<string, unknown>;
  const ok =
    r.kind === 'report' &&
    typeof r.game === 'string' &&
    typeof r.hash === 'string' &&
    Number.isInteger(r.status) &&
    Number.isInteger(r.side) &&
    Number.isFinite(r.rating) &&
    typeof r.pub === 'string' &&
    typeof r.sig === 'string';
  if (!ok) return null;
  return { kind: 'report', game: r.game as string, hash: r.hash as string, status: r.status as number, side: r.side as number, rating: r.rating as number, pub: r.pub as string, sig: r.sig as string };
}

/** Shape check for a Sync off the wire. Returns a clean copy or null. */
export function parseSync(x: unknown): Sync | null {
  if (typeof x !== 'object' || x === null) return null;
  const s = x as Record<string, unknown>;
  const ok =
    s.kind === 'sync' &&
    typeof s.game === 'string' &&
    Number.isInteger(s.seq) &&
    (s.seq as number) >= 0 &&
    Array.isArray(s.asked) &&
    s.asked.every((k) => typeof k === 'string');
  return ok ? { kind: 'sync', game: s.game as string, seq: s.seq as number, asked: [...(s.asked as string[])] } : null;
}

/** Shape check for a Missed off the wire: what it carries must be a record or an ask, never another message. */
export function parseMissed(x: unknown): Missed | null {
  if ((x as { kind?: unknown } | null)?.kind !== 'missed') return null;
  const of = parseRematch((x as Missed).of) ?? parseRecord((x as Missed).of);
  return of ? { kind: 'missed', of } : null;
}

/** Shape check for a Coordinator off the wire. Returns a clean copy or null. */
export function parseCoordinator(x: unknown): Coordinator | null {
  if (typeof x !== 'object' || x === null) return null;
  const c = x as Record<string, unknown>;
  const ok =
    c.kind === 'coordinator' && typeof c.game === 'string' && typeof c.coordinator === 'string' && typeof c.pub === 'string' && typeof c.sig === 'string';
  return ok ? { kind: 'coordinator', game: c.game as string, coordinator: c.coordinator as string, pub: c.pub as string, sig: c.sig as string } : null;
}

// A move record is one signed link of the game log: {game, seq, prev, move, pub, sig}. `prev` is the
// SHA-256 of the previous record, so the log is tamper evident (docs/specs/tech.md section 6).
// Signatures are Ed25519 from Web Crypto. Keys and signatures travel as base64url strings.

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

const ED = { name: 'Ed25519' } as const;

const b64 = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
const unb64 = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Join message: the sender's key and the seat it asks for. The creator's Hello also carries the roster, the keys by seat. */
export interface Hello {
  kind: 'hello';
  game: string;
  seat: number;
  roster: string[];
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

/** Anything a transport carries. */
export type Wire = MoveRecord | Hello | Rematch;

type Unsigned = Omit<MoveRecord, 'sig'>;

// Fixed field order, so both peers hash and verify the same bytes.
const payload = (r: Unsigned): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify([r.game, r.seq, r.prev, r.move, r.pub]));

const helloPayload = (h: Omit<Hello, 'sig'>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(['hello', h.game, h.seat, h.roster, h.pub]));

const rematchPayload = (r: Omit<Rematch, 'sig'>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(['rematch', r.game, r.pub]));

/** Whether `sig` is `pub`'s signature of `bytes`. Malformed base64 or key bytes are a refusal, never a throw. */
async function signedBy(pub: string, sig: string, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
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

export async function signHello(keys: Keys, fields: { game: string; seat: number; roster: string[] }): Promise<Hello> {
  const unsigned = { kind: 'hello' as const, ...fields, pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, helloPayload(unsigned))) };
}

export async function verifyHello(h: Hello): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', unb64(h.pub), ED, false, ['verify']);
    return await crypto.subtle.verify(ED, key, unb64(h.sig), helloPayload(h));
  } catch {
    return false; // malformed base64 or key bytes
  }
}

export async function signRematch(keys: Keys, fields: { game: string }): Promise<Rematch> {
  const unsigned = { kind: 'rematch' as const, ...fields, pub: keys.pub };
  return { ...unsigned, sig: b64(await crypto.subtle.sign(ED, keys.priv, rematchPayload(unsigned))) };
}

export function verifyRematch(r: Rematch): Promise<boolean> {
  return signedBy(r.pub, r.sig, rematchPayload(r));
}

export async function verifyRecord(r: MoveRecord): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', unb64(r.pub), ED, false, ['verify']);
    return await crypto.subtle.verify(ED, key, unb64(r.sig), payload(r));
  } catch {
    return false; // malformed base64 or key bytes
  }
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
    typeof h.pub === 'string' &&
    typeof h.sig === 'string';
  if (!ok) return null;
  return { kind: 'hello', game: h.game as string, seat: h.seat as number, roster: h.roster as string[], pub: h.pub as string, sig: h.sig as string };
}

/** Shape check for a Rematch off the wire. Returns a clean copy or null. */
export function parseRematch(x: unknown): Rematch | null {
  if (typeof x !== 'object' || x === null) return null;
  const r = x as Record<string, unknown>;
  const ok = r.kind === 'rematch' && typeof r.game === 'string' && typeof r.pub === 'string' && typeof r.sig === 'string';
  return ok ? { kind: 'rematch', game: r.game as string, pub: r.pub as string, sig: r.sig as string } : null;
}

// The signed events of the public Open world (#1305, docs/specs/multiplayer.md section 7): a hero's key, a signed "I broke this
// cell" and the grow-only set of them. A cell broken is broken for good, so merging two sets is a union: no order, no consensus.
// A peer proves only that the same key sent it, never who: the key is random and per browser.
import { b64, ED, generateKeys, signedBy, unb64, type Keys } from './moverecord';
import { read, write, type Store } from './quality';
import type { BreakEvent } from './worldpeers';

/** The most events held, and the most sent to a peer that joins, newest first. */
export const MAX_HELD = 2000;
export const SYNC_MAX = 200;
/** The pace of the sync to a newcomer, in ms between two events. */
export const SYNC_MS = 200;

const KEY = 'ab-alone.world-key';

/** The bytes a break signs: version 1, kind 1 (break), seed (u32), q and r (int16). */
const payload = (seed: number, q: number, r: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(10);
  const view = new DataView(out.buffer);
  out.set([1, 1]);
  view.setUint32(2, seed);
  view.setInt16(6, q);
  view.setInt16(8, r);
  return out;
};

export async function signBreak(keys: Keys, seed: number, q: number, r: number): Promise<BreakEvent> {
  return { seed, q, r, pub: keys.pub, sig: b64(await crypto.subtle.sign(ED, keys.priv, payload(seed, q, r))) };
}

export const verifyBreak = (e: BreakEvent): Promise<boolean> => signedBy(e.pub, e.sig, payload(e.seed, e.q, e.r));

/**
 * The player's key for the public world: read from the store, else made and kept there. The private part stays in this browser's
 * localStorage and is never sent or logged. A stored key that does not load is replaced; with no store a key lasts the visit.
 */
export async function worldKeys(store: Store): Promise<Keys> {
  try {
    const saved = JSON.parse(read(store, KEY) ?? '') as { priv: string; pub: string };
    const priv = await crypto.subtle.importKey('pkcs8', unb64(saved.priv), ED, false, ['sign']);
    const keys = { priv, pub: saved.pub };
    // The key must be the pair of the public key it claims: a signature that does not verify means the record is not ours.
    if (await verifyBreak(await signBreak(keys, 0, 0, 0))) return keys;
  } catch {
    // no record, or one that does not load: a new key below
  }
  const fresh = await generateKeys();
  write(store, KEY, JSON.stringify({ priv: b64(await crypto.subtle.exportKey('pkcs8', fresh.priv)), pub: fresh.pub }));
  return fresh;
}

/** The cells broken, keyed by cell, in the order they came. */
export class BreakSet {
  private readonly held = new Map<string, BreakEvent>();

  get size(): number {
    return this.held.size;
  }

  has(q: number, r: number): boolean {
    return this.held.has(`${q},${r}`);
  }

  /** Holds the event unless its cell is held already. Past MAX_HELD the oldest goes. True when it was new. */
  add(e: BreakEvent): boolean {
    const key = `${e.q},${e.r}`;
    if (this.held.has(key)) return false;
    this.held.set(key, e);
    if (this.held.size > MAX_HELD) this.held.delete(this.held.keys().next().value!);
    return true;
  }

  /** At most `count` events, the newest first. */
  newest(count: number): BreakEvent[] {
    return [...this.held.values()].reverse().slice(0, count);
  }

  clear(): void {
    this.held.clear();
  }
}

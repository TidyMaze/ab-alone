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

/** The bytes an event signs: version 1, its kind (1 break, 2 beaten), seed (u32), q and r (int16). The kind is signed, so a break
 * is never a beaten enemy of the same cell. */
const payload = ({ kind, seed, q, r }: Pick<BreakEvent, 'kind' | 'seed' | 'q' | 'r'>): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(10);
  const view = new DataView(out.buffer);
  out.set([1, kind === 'beaten' ? 2 : 1]);
  view.setUint32(2, seed);
  view.setInt16(6, q);
  view.setInt16(8, r);
  return out;
};

async function sign(keys: Keys, kind: BreakEvent['kind'], seed: number, q: number, r: number): Promise<BreakEvent> {
  const e = { kind, seed, q, r };
  return { ...e, pub: keys.pub, sig: b64(await crypto.subtle.sign(ED, keys.priv, payload(e))) };
}

export const signBreak = (keys: Keys, seed: number, q: number, r: number): Promise<BreakEvent> => sign(keys, 'break', seed, q, r);

/** A generated enemy marble of the world `seed` on `(q, r)` was ejected by a hero (#1305): the same signed event as a break. */
export const signBeaten = (keys: Keys, seed: number, q: number, r: number): Promise<BreakEvent> => sign(keys, 'beaten', seed, q, r);

export const verifyBreak = (e: BreakEvent): Promise<boolean> => signedBy(e.pub, e.sig, payload(e));

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

/** The cells broken or beaten, keyed by cell, in the order they came. A break and a beaten enemy never share a cell: an enemy stands on open ground. */
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

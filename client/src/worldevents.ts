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

/** The bytes an event signs: version 1, its kind (1 break, 2 beaten, 3 lair), seed (u32), q and r (int16). The kind is signed, so a
 * break is never a beaten enemy of the same cell. */
const payload = ({ kind, seed, q, r }: Pick<BreakEvent, 'kind' | 'seed' | 'q' | 'r'>): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(10);
  const view = new DataView(out.buffer);
  out.set([1, kind === 'beaten' ? 2 : kind === 'lair' ? 3 : 1]);
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

/** A hero took the boss lair on `(q, r)` of the world `seed` (#1305): the same signed event, kind 3. No proof of the fight is sent. */
export const signLair = (keys: Keys, seed: number, q: number, r: number): Promise<BreakEvent> => sign(keys, 'lair', seed, q, r);

export const verifyBreak = (e: BreakEvent): Promise<boolean> => signedBy(e.pub, e.sig, payload(e));

/**
 * The player's key for the public world: read from the store, else made and kept there. The private part stays in this browser's
 * localStorage and is never sent or logged. A stored key that does not load is replaced; with no store a key lasts the visit.
 */
export const worldKeys = (store: Store): Promise<Keys> => storedKeys(store, KEY);

/** The same, under another storage key: the ranked board's key (shareboard.ts) is made by this code and never shares the world's. */
export async function storedKeys(store: Store, key: string): Promise<Keys> {
  try {
    const saved = JSON.parse(read(store, key) ?? '') as { priv: string; pub: string };
    const priv = await crypto.subtle.importKey('pkcs8', unb64(saved.priv), ED, false, ['sign']);
    const keys = { priv, pub: saved.pub };
    // The key must be the pair of the public key it claims: a signature that does not verify means the record is not ours.
    if (await verifyBreak(await signBreak(keys, 0, 0, 0))) return keys;
  } catch {
    // no record, or one that does not load: a new key below
  }
  const fresh = await generateKeys();
  write(store, key, JSON.stringify({ priv: b64(await crypto.subtle.exportKey('pkcs8', fresh.priv)), pub: fresh.pub }));
  return fresh;
}

/** Where the held events are saved (#1305): `{ v: 1, events }`, the events as sent on the wire, oldest first. */
export const EVENTS_KEY = 'ab-alone.world-events';
const EVENTS_VERSION = 1;

const KINDS = new Set(['break', 'beaten', 'lair']);
const wellFormed = (e: unknown): e is BreakEvent => {
  const x = e as BreakEvent | null;
  return !!x && KINDS.has(x.kind) && Number.isInteger(x.seed) && Number.isInteger(x.q) && Number.isInteger(x.r) && typeof x.pub === 'string' && typeof x.sig === 'string';
};

/**
 * The cells broken or beaten, keyed by cell, in the order they came. A break and a beaten enemy never share a cell: an enemy stands on
 * open ground. With a store, the set is saved on each add (#1305) so a reload keeps the world; `clear()` empties the memory only. What
 * is saved is untrusted: `stored` returns it unchecked and the caller verifies each signature before `adopt`.
 */
export class BreakSet {
  private readonly held = new Map<string, BreakEvent>();

  constructor(private readonly store: Store = null) {}

  get size(): number {
    return this.held.size;
  }

  has(q: number, r: number): boolean {
    return this.held.has(`${q},${r}`);
  }

  /** Holds the event unless its cell is held already, and saves. Past MAX_HELD the oldest goes. True when it was new. */
  add(e: BreakEvent): boolean {
    if (!this.hold(e)) return false;
    this.save();
    return true;
  }

  /** Holds the events that were checked, then saves once. Returns those that were new. */
  adopt(events: BreakEvent[]): BreakEvent[] {
    const fresh = events.filter((e) => this.hold(e));
    this.save(false);
    return fresh;
  }

  private hold(e: BreakEvent): boolean {
    const key = `${e.q},${e.r}`;
    const had = this.held.get(key);
    if (had && !(e.kind === 'lair' && had.kind === 'beaten')) return false; // a lair-won event takes the place of a `beaten` one: anyone may send that, no one may shut the real one out
    this.held.set(key, e);
    if (this.held.size > MAX_HELD) this.held.delete(this.held.keys().next().value!);
    return true;
  }

  /** The saved events of the world `seed`, oldest first, shape-checked only. A missing, broken or other-version record gives none. */
  stored(seed: number): BreakEvent[] {
    return this.saved().filter((e) => e.seed === seed);
  }

  private saved(): BreakEvent[] {
    try {
      const record = JSON.parse(read(this.store, EVENTS_KEY) ?? '') as { v: number; events: unknown };
      return record.v === EVENTS_VERSION && Array.isArray(record.events) ? record.events.filter(wellFormed) : [];
    } catch {
      return [];
    }
  }

  /** Writes the saved events not held (another tab, or not loaded yet; none after `adopt`, which has checked them) then the held ones. Over the quota the oldest saved go, one at a
   * time; with no room at all the set lives in memory only. */
  private save(merge = true): void {
    if (!this.store) return;
    const old = merge ? this.saved().filter((e) => !this.held.has(`${e.q},${e.r}`)) : [];
    const events = [...old, ...this.held.values()].slice(-MAX_HELD);
    for (;;) {
      try {
        this.store.setItem(EVENTS_KEY, JSON.stringify({ v: EVENTS_VERSION, events }));
        return;
      } catch {
        if (events.length === 0) return;
        events.shift();
      }
    }
  }

  /** At most `count` events, the newest first. */
  newest(count: number): BreakEvent[] {
    return [...this.held.values()].reverse().slice(0, count);
  }

  /** Empties the memory; the saved set stays, so the world is back when the player returns. */
  clear(): void {
    this.held.clear();
  }
}

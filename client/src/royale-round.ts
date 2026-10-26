// Battle royale round book (docs/specs/tech.md section 6, #500): each live seat commits the signed hash of its order and a
// nonce, then reveals both; the book gives the round's orders by seat. Pure state, no timer and no clock of its own: the
// caller passes `now`. An order is a move record of 8 integers, an empty one is a hold.
import { signMove, verifyRecord, type Keys } from './moverecord';

/** `hash` is SHA-256(order || nonce), signed for one round of one game. */
export interface Commit {
  kind: 'commit';
  game: string;
  round: number;
  hash: string;
  pub: string;
  sig: string;
}

/** The order and nonce behind a commit, signed, so a bad one is pinned on its sender. */
export interface Reveal {
  kind: 'reveal';
  game: string;
  round: number;
  order: number[];
  nonce: string;
  pub: string;
  sig: string;
}

const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

export async function hashOrder(order: number[], nonce: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([order, nonce]))));
}

// Both are signed as move records whose game names the kind, so a commit, a reveal and a move never share signed bytes.
const commitFields = (c: Omit<Commit, 'kind' | 'pub' | 'sig'>) => ({ game: `commit:${c.game}`, seq: c.round, prev: c.hash, move: [] });
const revealFields = (r: Omit<Reveal, 'kind' | 'pub' | 'sig'>) => ({ game: `reveal:${r.game}`, seq: r.round, prev: r.nonce, move: r.order });

export async function signReveal(keys: Keys, fields: { game: string; round: number; order: number[]; nonce: string }): Promise<Reveal> {
  const { sig } = await signMove(keys, revealFields(fields));
  return { kind: 'reveal', ...fields, pub: keys.pub, sig };
}

/** A commit of `order` under a fresh nonce, and the reveal to send once the reveal starts. */
export async function commitOrder(keys: Keys, fields: { game: string; round: number; order: number[] }): Promise<{ commit: Commit; reveal: Reveal }> {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const unsigned = { game: fields.game, round: fields.round, hash: await hashOrder(fields.order, nonce) };
  const { sig } = await signMove(keys, commitFields(unsigned));
  return { commit: { kind: 'commit', ...unsigned, pub: keys.pub, sig }, reveal: await signReveal(keys, { ...fields, nonce }) };
}

export function verifyCommit(c: Commit): Promise<boolean> {
  return verifyRecord({ ...commitFields(c), pub: c.pub, sig: c.sig });
}

export function verifyReveal(r: Reveal): Promise<boolean> {
  return verifyRecord({ ...revealFields(r), pub: r.pub, sig: r.sig });
}

const isOrder = (o: number[]): boolean => (o.length === 0 || o.length === 8) && o.every(Number.isInteger);

/**
 * One round as one peer sees it. `seats` are the live seats' keys in seat order. The reveal starts once every live seat
 * committed or at `commitBy`; the orders are known once every committed seat revealed to this peer itself, or at
 * `revealBy`. A seat without a commit holds; a seat without a matching reveal holds and is flagged.
 *
 * A seat may send other commits or reveals to other peers (#532). The caller passes each message with `from`, the key of
 * the seat it came from (its own key for its own), one message at a time, forwards every message the book keeps (true)
 * to every other peer at once, and sends its own reveal once `revealing(now)`. Channels are reliable and ordered, so a
 * peer gets everything another seat forwarded before that seat's reveal, and it seals only after every seat's reveal.
 */
export class RoundBook {
  readonly flagged = new Set<string>();
  private readonly commits = new Map<string, string[]>(); // key -> its committed hashes, two prove it equivocated
  private readonly played = new Map<string, number[]>(); // key -> its revealed order
  private readonly heard = new Set<string>(); // keys whose matching reveal came from themselves
  private sealed: number[][] | null = null;

  constructor(
    readonly game: string,
    readonly round: number,
    readonly seats: string[],
    private readonly commitBy: number,
    private readonly revealBy: number,
  ) {}

  /** True when the commit is kept: signed, for this game and round, from a live seat, new, before the orders. A first
   * commit counts before the reveal starts. A second one is the proof its key equivocated: the seat holds and is flagged.
   * It counts before the reveal starts, or later when forwarded by another seat that has not revealed to this peer yet,
   * since then every honest peer holds it before sealing. */
  async commit(c: Commit, now: number, from: string): Promise<boolean> {
    const ok = c.game === this.game && c.round === this.round && this.seats.includes(c.pub) && (await verifyCommit(c));
    const kept = this.commits.get(c.pub);
    if (!ok || kept?.includes(c.hash) || this.orders(now) !== null) return false;
    if (!kept) {
      if (this.revealing(now)) return false;
      this.commits.set(c.pub, [c.hash]);
      return true;
    }
    const counts = !this.revealing(now) || (from !== c.pub && this.seats.includes(from) && !this.heard.has(from));
    if (kept.length > 1 || !counts) return false;
    kept.push(c.hash);
    this.played.delete(c.pub);
    this.flagged.add(c.pub);
    return true;
  }

  revealing(now: number): boolean {
    return now >= this.commitBy || this.commits.size === this.seats.length;
  }

  /** True when the reveal gives an order not known yet. A signed one that does not match the commit, or is not an order,
   * flags its sender, whose seat holds unless a matching one comes. One that cannot be pinned on a seat with one commit
   * is refused and flags nobody. */
  async reveal(r: Reveal, now: number, from: string): Promise<boolean> {
    const ok = r.game === this.game && r.round === this.round && (await verifyReveal(r));
    const hash = isOrder(r.order) ? await hashOrder(r.order, r.nonce) : null;
    const kept = this.commits.get(r.pub);
    if (!ok || kept?.length !== 1 || this.orders(now) !== null) return false;
    if (hash !== kept[0]) {
      this.flagged.add(r.pub);
      return false;
    }
    if (from === r.pub) this.heard.add(r.pub);
    if (this.played.has(r.pub)) return false;
    this.played.set(r.pub, r.order);
    return true;
  }

  /** The orders by seat, an empty one for a hold, or null while the round is still open. Final once given. */
  orders(now: number): number[][] | null {
    if (this.sealed) return this.sealed;
    const all = [...this.commits].every(([k, hashes]) => hashes.length > 1 || this.heard.has(k));
    if (!this.revealing(now) || (!all && now < this.revealBy)) return null;
    for (const k of this.commits.keys()) if (!this.played.has(k)) this.flagged.add(k);
    this.sealed = this.seats.map((k) => this.played.get(k) ?? []);
    return this.sealed;
  }
}

// Coordinator migration (docs/specs/tech.md section 6, #359): pure state, no timer and no clock of its own.
// The caller passes `now`, so a test moves time without waiting.

export const BEAT_MS = 5000; // a heartbeat every 5 s
export const MISSES = 3; // three beats in a row missed: the peer is gone

/** The heartbeat period of the page: 5 s, or the `beat` URL parameter (ms) under navigator.webdriver, so an e2e test sees a
 * migration in a second. A player never gets a shortened one. */
export function beatPeriod(search: string, webdriver: boolean): number {
  const ms = Number(new URLSearchParams(search).get('beat'));
  return webdriver && Number.isInteger(ms) && ms >= 50 ? ms : BEAT_MS;
}

const rank = (order: string[], key: string): number => {
  const i = order.indexOf(key);
  return i < 0 ? Infinity : i;
};
const before = (order: string[], a: string, b: string): boolean =>
  rank(order, a) !== rank(order, b) ? rank(order, a) < rank(order, b) : a < b;

/** The live key with the lowest join_seq (its place in `order`), '' when none is live. A key the order does not
 * list comes after the listed ones, then by key: every peer with the same live set picks the same one. */
export function chooseCoordinator(order: string[], live: Iterable<string>): string {
  return [...live].sort((a, b) => (before(order, a, b) ? -1 : 1))[0] ?? '';
}

/**
 * Who coordinates the room, as one peer sees it. `order` is the join order the coordinator published, so
 * join_seq is the same on every peer. A room of two has no host: nothing moves.
 */
export class Coordination {
  coordinator = '';
  private order: string[] = [];
  private readonly live: Set<string>;
  private readonly last = new Map<string, number>(); // key -> time of its last heartbeat
  private readonly acks = new Map<string, Set<string>>(); // coordinator -> keys that acknowledged it

  constructor(
    readonly self: string,
    private readonly beatMs = BEAT_MS,
    private readonly misses = MISSES,
  ) {
    this.live = new Set([self]);
  }

  /** The join order from the coordinator. The first one also names the coordinator. */
  adopt(order: string[]): void {
    this.order = order;
    if (this.coordinator === '') this.coordinator = order[0]!;
  }

  /** The join_seq of a key, from 1, 0 when the order does not list it. */
  seqOf(key: string): number {
    return this.order.indexOf(key) + 1;
  }

  get seq(): number {
    return this.seqOf(this.coordinator);
  }

  /** `key` is alive at `now`: a heartbeat, or its Hello. */
  beat(key: string, now: number): void {
    this.live.add(key);
    this.last.set(key, now);
  }

  /** Marks the silent peers gone. Returns the new coordinator when this moved it. */
  tick(now: number): string | null {
    for (const [key, t] of this.last) {
      if (now - t > this.misses * this.beatMs) {
        this.last.delete(key);
        this.live.delete(key);
      }
    }
    return this.elect();
  }

  /** The channel of `key` dropped. Returns the new coordinator when this moved it. */
  leave(key: string): string | null {
    this.last.delete(key);
    this.live.delete(key);
    return this.elect();
  }

  /** `from` announced itself as coordinator at `now`. Its signed word proves it live. True when we follow it: it is the one
   * we have, or the lowest join_seq among the live keys once it counts. Another one is stale, or we still see a lower key
   * alive and will elect it ourselves when it times out. */
  announced(from: string, now: number): boolean {
    if (from === this.coordinator) return true;
    if (this.seqOf(from) === 0) return false;
    this.beat(from, now);
    if (chooseCoordinator(this.order, this.live) !== from) return false;
    this.coordinator = from;
    return true;
  }

  /** `key` acknowledged `coordinator`. Kept even before we elected it ourselves: the acknowledgement may come first. */
  ack(key: string, coordinator: string): void {
    this.acks.set(coordinator, (this.acks.get(coordinator) ?? new Set()).add(key));
  }

  /** The live keys that have not acknowledged the coordinator yet. A peer that dropped is not waited for. */
  get waiting(): string[] {
    const acked = this.acks.get(this.coordinator);
    return [...this.live].filter((k) => k !== this.coordinator && !acked?.has(k));
  }

  get done(): boolean {
    return this.waiting.length === 0;
  }

  private elect(): string | null {
    if (this.order.length <= 2 || this.live.has(this.coordinator)) return null;
    const next = chooseCoordinator(this.order, this.live);
    this.coordinator = next;
    return next;
  }
}

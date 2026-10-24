// Client-side observability (docs/specs/tech.md section 10): a logger with levels that keeps its last entries in
// memory and prints them on the console. Nothing is sent anywhere.

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Entry {
  t: number; // ms since the page started, rounded
  level: Level;
  event: string;
  data?: Record<string, unknown>;
}

/** Where entries are printed: the console in the page, a fake in the tests. */
export type Sink = Pick<Console, Level>;

/** How many entries the logger keeps. */
export const LOG_SIZE = 1000;

/** Fixed-size buffer: once full, each push overwrites the oldest item. */
export class Ring<T> {
  private readonly items: T[] = [];
  private next = 0;
  dropped = 0; // items overwritten so far

  constructor(readonly capacity: number) {}

  push(item: T): void {
    if (this.items.length < this.capacity) this.items.push(item);
    else {
      this.items[this.next] = item;
      this.dropped += 1;
    }
    this.next = (this.next + 1) % this.capacity;
  }

  /** Oldest first. */
  toArray(): T[] {
    return [...this.items.slice(this.next), ...this.items.slice(0, this.next)];
  }
}

// The session keys live in memory: only the public half may be logged or exported, the diagnostics may be pasted
// into a public issue.
const PRIVATE = new Set(['priv', 'privateKey']);

/** A plain JSON copy of `value`, without private keys: fields named `priv` or `privateKey` and any CryptoKey. */
export function scrub<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => (PRIVATE.has(key) || v instanceof CryptoKey ? undefined : v)));
}

export class Logger {
  private readonly ring: Ring<Entry>;

  constructor(
    private readonly now: () => number,
    private readonly out: Sink,
    capacity = LOG_SIZE,
  ) {
    this.ring = new Ring(capacity);
  }

  log(level: Level, event: string, data?: Record<string, unknown>): void {
    const entry: Entry = { t: Math.round(this.now()), level, event, ...(data && { data: scrub(data) }) };
    this.ring.push(entry);
    this.out[level](`[ab-alone] ${event}`, entry);
  }

  /** The kept entries, oldest first. */
  get entries(): Entry[] {
    return this.ring.toArray();
  }

  /** Entries that fell out of the buffer. */
  get dropped(): number {
    return this.ring.dropped;
  }
}

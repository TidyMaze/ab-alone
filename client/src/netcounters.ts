import type { ConnectionState } from './transport';

/** A joiner that finds no peer in this time counts a signaling timeout: the relays never brought it the room. */
export const SIGNALING_TIMEOUT_MS = 30_000;

// Refusals that show the other side's log or position is not ours. Until moves carry a state hash
// (docs/specs/tech.md section 6), these are the desync reports.
const DESYNC = new Set(['bad-chain', 'out-of-order', 'illegal', 'not-their-turn']);

/** Local connection counters (docs/specs/tech.md section 10). They drive the TURN decision of section 6. */
export interface Counts {
  opened: number; // connections that reached open
  failures: Record<string, number>; // by cause: lost, signaling-timeout, ice-failed, join-error
  connectMs: number[]; // time to connect of each opened connection
  refused: Record<string, number>; // refused messages by reason
  desync: number;
}

/** Trystero reports an ICE failure as a join error: the peers swapped their SDP but never connected. */
export function joinErrorCause(message: string): string {
  return /after exchanging SDP/.test(message) ? 'ice-failed' : 'join-error';
}

export class NetCounters {
  private readonly c: Counts = { opened: 0, failures: {}, connectMs: [], refused: {}, desync: 0 };
  private open = false;
  private since: number | null = null; // start of the current connecting period
  private timedOut = false; // the current connecting period already counted its timeout

  constructor(private readonly now: () => number) {}

  /** A copy of the counts. */
  get counts(): Counts {
    return structuredClone(this.c);
  }

  /** A transport starts connecting. */
  connecting(): void {
    this.since = this.now();
    this.timedOut = false;
  }

  /** A state change of the transport. Losing an open connection starts a new connecting period. */
  state(s: ConnectionState): void {
    if (s === 'open') {
      if (this.open) return; // another peer joined a room that is open already
      this.open = true;
      this.c.opened += 1;
      if (this.since !== null) this.c.connectMs.push(Math.round(this.now() - this.since));
      this.since = null;
      return;
    }
    if (!this.open) return;
    this.open = false;
    if (s === 'closed') this.fail('lost');
    this.connecting();
  }

  /** Counts a signaling timeout once the current connecting period lasted `limit` ms. True when it counted. */
  timeout(limit = SIGNALING_TIMEOUT_MS): boolean {
    if (this.since === null || this.timedOut || this.now() - this.since < limit) return false;
    this.timedOut = true;
    this.fail('signaling-timeout');
    return true;
  }

  /** Counts a Trystero join error by its cause, and returns the cause. */
  joinError(message: string): string {
    const cause = joinErrorCause(message);
    this.fail(cause);
    return cause;
  }

  /** Counts a refused message by its reason. True when the reason is a desync. */
  refuse(reason: string): boolean {
    this.c.refused[reason] = (this.c.refused[reason] ?? 0) + 1;
    if (!DESYNC.has(reason)) return false;
    this.c.desync += 1;
    return true;
  }

  private fail(cause: string): void {
    this.c.failures[cause] = (this.c.failures[cause] ?? 0) + 1;
  }
}

// An online room (docs/specs/mcp.md section 7): the browser client's own OnlineSession, over a Transport, with the
// engine as its judge. It signs the agent's moves and checks every move it receives, as the client does for a human.
import type { Keys } from '../../client/src/moverecord';
import { NetCounters } from '../../client/src/netcounters';
import { OnlineSession, type Judge } from '../../client/src/session';
import type { Transport } from '../../client/src/transport';
import { engineVersion } from './engine';

/** What `wait_for_opponent_move` reports. */
export type RoomEvent = 'opponent_moved' | 'game_over' | 'opponent_left' | 'desync' | 'timeout';

export class Room {
  readonly session: OnlineSession;
  private wakes: (() => void)[] = [];
  private left = false;
  private desync = false;

  constructor(id: string, side: number, keys: Keys, private readonly transport: Transport, judge: Judge, creator?: string) {
    // The client's counters say which refusals are a desync (docs/specs/tech.md section 10).
    const counters = new NetCounters(Date.now);
    const changed = (): void => {
      for (const wake of this.wakes.splice(0)) wake();
    };
    this.session = new OnlineSession({
      game: id,
      side,
      engine: engineVersion(),
      agent: true,
      keys,
      transport,
      judge,
      creator,
      onMove: changed,
      onRefuse: (reason) => {
        this.desync ||= counters.refuse(reason);
        changed();
      },
      onPresence: () => {
        this.left ||= this.session.presenceOf(3 - this.session.side) === 'gone';
        changed();
      },
      onRole: changed,
    });
  }

  /**
   * The next thing to report, `undefined` while there is none. A desync and a leave are reported once. Then the
   * agent's turn: its opponent has moved, or has just taken its seat when nobody moved yet.
   */
  event(over: boolean): RoomEvent | undefined {
    if (this.desync) {
      this.desync = false;
      return 'desync';
    }
    if (over) return 'game_over';
    if (this.left) {
      this.left = false;
      return 'opponent_left';
    }
    return this.session.canPlay() ? 'opponent_moved' : undefined;
  }

  /** Calls `check` now and after each change in the room until it gives something, or `ms` pass: then `undefined`. */
  async until<T>(check: () => T | undefined, ms: number): Promise<T | undefined> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = check();
      if (found !== undefined || !(await this.changed(deadline - Date.now()))) return found;
    }
  }

  close(): void {
    this.transport.close();
  }

  /** True on the next change in the room, false after `ms`. */
  private changed(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      this.wakes.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
}

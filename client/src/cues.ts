// Which game event plays which cue (world.md section 7, the cue table; #1570). Pure, so main.ts only asks and plays:
// each watch remembers what it last saw, so that a redraw of the plate never sounds a cue twice.

import type { Axial } from './board';
import type { EndAnim } from './endbanner';

/** The cues the Open world asks for (the mode tells, the page plays them). */
export type WorldCue = 'step' | 'pickup' | 'time-of-day';

/** The end of a game sounds once per game: the plate is drawn again on every refresh. */
export class EndWatch {
  private last: unknown = null;

  /** The cue of the end of `game`, the first time it shows one; null for a running game or a game already told. The win of a
   * boss fight is the boss death and not a win: one sound for that moment. */
  fresh(game: unknown, anim: EndAnim | undefined, boss = false): 'win' | 'loss' | 'draw' | 'boss-death' | null {
    if (anim === undefined || game === this.last) return null;
    this.last = game;
    return boss && anim === 'win' ? 'boss-death' : anim;
  }
}

/** A boss phase change, or the phase of the day, sounds when the phase of the same game moves: the first sight of a game is its starting phase. */
export class PhaseWatch {
  private game: unknown = null;
  private phase: number | string = 0;

  changed(game: unknown, phase: number | string): boolean {
    const same = game === this.game;
    const moved = same && phase !== this.phase;
    this.game = game;
    this.phase = phase;
    return moved;
  }
}

/** A royale marble set eliminated sounds once for the seats that just went out, however many in the same draw, so that
 * a breach taking three sets is one cue, not a stack. The first sight of a game is silent. */
export class OutWatch {
  private game: unknown = null;
  private seen = new Set<number>();

  fresh(game: unknown, out: readonly number[]): boolean {
    const first = game !== this.game;
    const news = out.some((seat) => !this.seen.has(seat));
    this.game = game;
    this.seen = new Set(out);
    return !first && news;
  }
}

/** A count that rises in the same game sounds (the relics of a run, the round of a royale): the first sight of a game is silent. */
export class CountWatch {
  private game: unknown = null;
  private count = 0;

  rose(game: unknown, count: number): boolean {
    const rose = game === this.game && count > this.count;
    this.game = game;
    this.count = count;
    return rose;
  }
}

/** A selection sounds when it changes to a group of marbles, never on a redraw of the plate, and not when it is cleared (a move
 * clears it, and a move has its own knock). */
export class SelectionWatch {
  private last = '';

  changed(cells: readonly Axial[]): boolean {
    const key = JSON.stringify(cells);
    const changed = cells.length > 0 && key !== this.last;
    this.last = key;
    return changed;
  }
}

/** The least time between two steps that sound, in ms: under a step at normal speed (140 ms), so that every step of a walk sounds
 * and a walk at cruising speed (80 ms) sounds one in two. */
export const STEP_GAP_MS = 120;

/** The steps of the hero sound no faster than `STEP_GAP_MS`. */
export class StepWatch {
  private last = -Infinity;

  /** Whether the step at `at` (ms) sounds. A step that is skipped does not push the next one back. */
  due(at: number): boolean {
    const due = at - this.last >= STEP_GAP_MS;
    if (due) this.last = at;
    return due;
  }
}

/** Whether the turn has come back to the player (`mine`) after a move of the other side: the game runs, and no Replay is open.
 * Called only where a bot or an online opponent has just moved, so a hot seat never sounds it. */
export const turnBack = (toMove: number, mine: number, status: number, replaying: boolean): boolean => toMove === mine && status === 0 && !replaying;

/** Something that comes up (the reward of a won rogue-lite fight) sounds when it appears, not while it stays. */
export class EdgeWatch {
  private on = false;

  entered(on: boolean): boolean {
    const was = this.on;
    this.on = on;
    return on && !was;
  }
}

/** Whether a press on `target` is a UI click: a button, or something in one. The board is a canvas, so a move on it never
 * is; a node of the rogue-lite map and Start have their own pick sound. */
export function clickable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const button = target.closest('button');
  return button !== null && !button.hasAttribute('data-node') && button.id !== 'run-start';
}

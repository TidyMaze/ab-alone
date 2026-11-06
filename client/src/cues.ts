// Which game event plays which cue (world.md section 7, the cue table; #1570). Pure, so main.ts only asks and plays:
// each watch remembers what it last saw, so that a redraw of the plate never sounds a cue twice.

import type { EndAnim } from './endbanner';

/** A win or a loss sounds once per game: the plate is drawn again on every refresh. A draw has no cue. */
export class EndWatch {
  private last: unknown = null;

  /** The cue of the end of `game`, the first time it shows one; null for a draw, a running game or a game already told. */
  fresh(game: unknown, anim: EndAnim | undefined): 'win' | 'loss' | null {
    if (anim !== 'win' && anim !== 'loss') return null;
    if (game === this.last) return null;
    this.last = game;
    return anim;
  }
}

/** A boss phase change sounds when the phase of the same game moves: the first sight of a game is its starting phase. */
export class PhaseWatch {
  private game: unknown = null;
  private phase = 0;

  changed(game: unknown, phase: number): boolean {
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

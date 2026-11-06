/**
 * The transition of a place (#1519, docs/specs/motion.md story 10): one for a tower, a dungeon gate and a town. A layer over the page, which
 * already shows the place (the game is live under it and takes every press): a dim that lifts, a cue of the kind of place that opens, and the
 * name of the place. The way back plays the cue again, with no name. Under reduced motion the dim and the cue are cut and the name stays, still;
 * the way back is a hard cut. The layer takes no press: any press, or a new key, ends it. Opacity and transform only, written as three numbers
 * (`--dim`, `--open`, `--title`) that `placeFrame` gives, so the timing is a plain function.
 */

export type PlaceKind = 'tower' | 'dungeon' | 'town';

/** The length of the transition into a place, the budget of a transition (motion.md story 10), and of the way back. */
export const ENTER_MS = 600;
export const RETURN_MS = 400;
/** The most a single frame moves the clock of the transition. */
export const MAX_STEP_MS = 50;

export interface PlaceFrame {
  /** 1 fully dark, 0 clear. */
  dim: number;
  /** 0 shut, 1 open: the doors of a tower apart, the arch of a gate grown past the screen. */
  open: number;
  /** 0 hidden, 1 shown. */
  title: number;
}

/** The frame of reduced motion: no dim, no cue, the name shown. */
const CUT: PlaceFrame = { dim: 0, open: 1, title: 1 };
const clamp = (t: number): number => Math.min(1, Math.max(0, t));
/** Starts fast and settles, as `--ease-out`. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** The title fades in over the first 15 % and out over the last 20 %. */
const IN = 0.15;
const OUT = 0.2;

/** The three numbers at `t`, from 0 to 1 of the transition: the dim lifts evenly, the cue opens fast and settles; `titled` is false for the way back, which names nothing. */
export function placeFrame(t: number, titled: boolean): PlaceFrame {
  const x = clamp(t);
  const eased = easeOut(x);
  return { dim: 1 - x, open: eased, title: titled ? clamp(Math.min(x / IN, (1 - x) / OUT)) : 0 };
}

/** What the title says: the boss's name for a tower, and for a town and a gate the name the mode menu gives what they open. */
export function placeTitle(kind: PlaceKind, boss: string): string {
  if (kind === 'tower') return boss;
  return kind === 'town' ? 'Hub' : 'Rogue-lite run';
}

export class PlaceTransition {
  private root: HTMLElement | null = null;
  private frame = 0;
  private running = false;

  constructor(private readonly reduced: () => boolean) {}

  /** Into a place: the cue of its kind and its name over the page. */
  enter(kind: PlaceKind, title: string): void {
    this.run(kind, ENTER_MS, title);
  }

  /** Back in the world from a place of `kind`; a hard cut under reduced motion, as there is no name to keep. */
  back(kind: PlaceKind): void {
    if (!this.reduced()) this.run(kind, RETURN_MS, null);
  }

  /** Ends the transition at once: the page is as it is. */
  end = (): void => {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.root!.hidden = true;
    delete document.body.dataset.placeTransition;
    window.removeEventListener('pointerdown', this.end, true);
    window.removeEventListener('keydown', this.skip, true);
  };

  /** A new key ends it, the repeat of a held one does not. */
  private skip = (e: KeyboardEvent): void => {
    if (!e.repeat) this.end();
  };

  private run(kind: PlaceKind, ms: number, title: string | null): void {
    this.end();
    const root = this.element();
    root.dataset.kind = kind;
    root.querySelector('.pt-title')!.textContent = title ?? '';
    root.hidden = false;
    document.body.dataset.placeTransition = title === null ? 'back' : 'enter';
    this.running = true;
    window.addEventListener('pointerdown', this.end, true); // before the page's own listeners: the press then lands on the resting page
    window.addEventListener('keydown', this.skip, true);
    const cut = this.reduced();
    if (cut) root.dataset.motion = 'cut';
    else delete root.dataset.motion;
    const frame = (t: number): PlaceFrame => (cut ? CUT : placeFrame(t, title !== null)); // the name stays, still and whole, and nothing else shows
    let last = -1;
    let elapsed = 0;
    const step = (now: number): void => {
      if (last >= 0) elapsed += Math.min(now - last, MAX_STEP_MS); // a frame that came late counts as a short one: a place that takes a few hundred ms to draw does not eat the transition
      last = now;
      const t = elapsed / ms;
      this.write(root, frame(t));
      if (t >= 1) this.end();
      else this.frame = requestAnimationFrame(step);
    };
    this.write(root, frame(0));
    this.frame = requestAnimationFrame(step);
  }

  private write(root: HTMLElement, f: PlaceFrame): void {
    root.style.setProperty('--dim', String(f.dim));
    root.style.setProperty('--open', String(f.open));
    root.style.setProperty('--title', String(f.title));
  }

  /** The layer: made once, again if the page cleared it. */
  private element(): HTMLElement {
    if (this.root?.isConnected) return this.root;
    const root = document.createElement('div');
    root.id = 'place-transition';
    root.hidden = true;
    root.innerHTML = '<div class="pt-dim"></div><div class="pt-arch"></div><div class="pt-door pt-door-l"></div><div class="pt-door pt-door-r"></div><p class="pt-title"></p>';
    document.body.append(root);
    return (this.root = root);
  }
}

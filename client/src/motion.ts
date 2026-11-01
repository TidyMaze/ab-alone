/** Motion tokens (#1106, docs/specs/motion.md): the same numbers as the CSS custom properties in ui.css. */
export const MOTION = { instant: 80, fast: 120, base: 200, slow: 320, celebrate: 1200 } as const;

/** The three easings, as the CSS custom properties `--ease-out`, `--ease-in` and `--ease-in-out`. */
export const EASE = {
  out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  in: 'cubic-bezier(0.5, 0, 0.9, 0.4)',
  'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** Whether motion is cut: the `data-motion='reduced'` switch main.ts sets from `motionReduced` (settings.ts). */
export const reducedMotion = (root: { dataset: DOMStringMap } = document.documentElement): boolean => root.dataset.motion === 'reduced';

/** Plays a one-shot CSS cue: `cls` goes on `el` (again from the start if it was on) and off after `ms`, so a later redraw never replays it. */
const cueTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
export function cue(el: Element, cls: string, ms: number): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // a reflow, so the animation starts over
  el.classList.add(cls);
  clearTimeout(cueTimers.get(el));
  cueTimers.set(el, setTimeout(() => el.classList.remove(cls), ms));
}

/** A cross-fade between screens (#1099): the new screen fades in on `MOTION.base` over the old one. Opacity only, so no layout shift; the state has already changed and input is never held. Reduced motion: a hard cut. */
export function crossFade(el: Element): void {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base, easing: EASE.out });
}

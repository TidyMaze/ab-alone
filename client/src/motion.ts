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

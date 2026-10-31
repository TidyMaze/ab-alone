import { describe, expect, it } from 'vitest';
import { EASE, MOTION, reducedMotion } from './motion';
import { SLIDE_MS } from './slide';
import css from './ui.css?raw';

const NAMES = ['instant', 'fast', 'base', 'slow', 'celebrate'] as const;
const declared = (block: string, name: string): string | undefined => block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
const tokens = css.match(/\/\* motion tokens[^]*?:root\s*\{([^}]*)\}/)![1]!;
const reduced = css.match(/:root\[data-motion='reduced'\]\s*\{([^}]*)\}/)![1]!;

describe('motion tokens (#1106)', () => {
  it('defines the five durations in ui.css with the same values as MOTION', () => {
    for (const n of NAMES) expect(declared(tokens, `motion-${n}`)).toBe(`${MOTION[n]}ms`);
  });

  it('defines the three easings in ui.css with the same values as EASE', () => {
    for (const [n, value] of Object.entries(EASE)) expect(declared(tokens, `ease-${n}`)).toBe(value);
  });

  it('matches the numbers of docs/specs/motion.md', () => {
    expect(MOTION).toEqual({ instant: 80, fast: 120, base: 200, slow: 320, celebrate: 1200 });
  });

  it('computes every duration to 0ms under the Reduced motion switch', () => {
    for (const n of NAMES) expect(declared(reduced, `motion-${n}`)).toBe('0ms');
  });

  it('makes the marble slide the base token', () => {
    expect(SLIDE_MS).toBe(MOTION.base);
  });
});

describe('menus and buttons answer touch (#1094)', () => {
  const block = css.match(/\/\* Touch motion \(#1094,[^]*$/)![0];

  it('presses a dock or sheet button down on the instant token with the out easing', () => {
    expect(block).toMatch(/#dock-wrap button \{[^}]*transition: transform var\(--motion-instant\) var\(--ease-out\)/);
    expect(block).toMatch(/#dock-wrap button:active:not\(:disabled\) \{[^}]*transform: scale\(0\.96\)/);
  });

  it('opens every sheet on the base token with the out easing', () => {
    for (const id of ['mode-menu', 'goal-sheet', 'daily-card', 'lobby-sheet']) expect(block).toContain(`#dock-wrap #${id}`);
    expect(block).toMatch(/animation: sheet-in var\(--motion-base\) var\(--ease-out\)/);
    expect(block).toMatch(/@keyframes sheet-in \{ from \{ opacity: 0; transform: translateY\(8px\); \} \}/);
  });

  it('is cut by the reduced switch', () => {
    expect(css).toMatch(/:root\[data-motion='reduced'\] \*[^{]*\{ animation-duration: 0s !important; transition-duration: 0s !important; \}/);
  });
});

describe('reducedMotion', () => {
  it('follows data-motion on the root', () => {
    expect(reducedMotion({ dataset: {} })).toBe(false);
    expect(reducedMotion({ dataset: { motion: 'reduced' } })).toBe(true);
  });
});

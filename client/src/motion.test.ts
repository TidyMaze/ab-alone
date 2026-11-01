// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EASE, MOTION, reducedMotion, cue } from './motion';
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

describe('cue (#1097)', () => {
  afterEach(() => vi.useRealTimers());

  it('adds the class, restarts it when called again, and removes it after the duration', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    cue(el, 'refused', MOTION.fast);
    expect(el.classList.contains('refused')).toBe(true);
    vi.advanceTimersByTime(MOTION.fast - 20);
    cue(el, 'refused', MOTION.fast); // a second refusal restarts the cue
    vi.advanceTimersByTime(MOTION.fast - 20);
    expect(el.classList.contains('refused')).toBe(true);
    vi.advanceTimersByTime(20);
    expect(el.classList.contains('refused')).toBe(false);
  });
});

describe('refusal, hint and copy motion (#1097, #1098)', () => {
  const block = css.match(/\/\* Refusal, hint and copy motion \(#1097[^]*$/)![0];

  it('shakes the turn line of a refused move once on the fast token', () => {
    expect(block).toMatch(/body\.refused #hud \.turn \{[^}]*animation: refuse var\(--motion-fast\) var\(--ease-out\)/);
    expect(block).toMatch(/@keyframes refuse \{[^}]*translateX/);
  });

  it('draws the Hint button in on the base token when its move is shown', () => {
    expect(block).toMatch(/body\[data-hint='shown'\] #hint \{[^}]*animation: hint-in var\(--motion-base\) var\(--ease-out\)/);
    expect(block).toMatch(/@keyframes hint-in/);
  });

  it('draws a check mark on Copied on the fast token', () => {
    expect(block).toMatch(/#daily-copy\.copied::before \{[^}]*content: '\\2713'[^}]*animation: check-in var\(--motion-fast\) var\(--ease-out\)/);
    expect(block).toMatch(/@keyframes check-in \{[^}]*clip-path/);
  });
});

describe('screen transitions (#1099)', () => {
  const block = css.match(/\/\* Screen transitions \(#1099[^]*$/)![0];

  it('fades the canvas in on the base token when the Open world is entered', () => {
    expect(block).toMatch(/body\[data-openworld\] canvas \{[^}]*animation: screen-in var\(--motion-base\) var\(--ease-out\)/);
    expect(block).toMatch(/@keyframes screen-in \{ from \{ opacity: 0; \} \}/);
  });

  it('fades the canvas in the same way when the Open world is left', () => {
    expect(block).toMatch(/body:not\(\[data-openworld\], \[data-over\]\) canvas \{[^}]*animation: screen-in var\(--motion-base\) var\(--ease-out\)/);
  });

  it('moves opacity only, so the game stays live under the fade', () => {
    expect(block).not.toMatch(/pointer-events|visibility|display/);
  });
});

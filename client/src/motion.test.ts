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

describe('reducedMotion', () => {
  it('follows data-motion on the root', () => {
    expect(reducedMotion({ dataset: {} })).toBe(false);
    expect(reducedMotion({ dataset: { motion: 'reduced' } })).toBe(true);
  });
});

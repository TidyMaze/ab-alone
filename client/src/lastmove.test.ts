import { describe, expect, it } from 'vitest';
import { MOTION } from './motion';
import { SLIDE_MS } from './slide';
import { LAST_MOVE_REST, lastMovePulse } from './lastmove';

describe('lastMovePulse', () => {
  it('peaks when the slide ends and fades to the resting mark over the base duration', () => {
    expect(lastMovePulse(SLIDE_MS, false)).toEqual({ opacity: 1, scale: 1.4 });
    const mid = lastMovePulse(SLIDE_MS + MOTION.base / 2, false);
    expect(mid.opacity).toBeGreaterThan(LAST_MOVE_REST);
    expect(mid.opacity).toBeLessThan(1);
    expect(lastMovePulse(SLIDE_MS + MOTION.base, false)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
    expect(lastMovePulse(99999, false)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
  });
  it('rests during the slide', () => {
    expect(lastMovePulse(0, false)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
  });
  it('is a static mark under reduced motion', () => {
    expect(lastMovePulse(SLIDE_MS, true)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
  });
});

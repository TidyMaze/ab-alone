// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FADE_MS, WIPE_MS, wipe } from './wildwipe';

// The transition into a wild fight (#1511): a flash and a wipe of about a second, a plain fade under reduced motion.
const cover = (): HTMLElement => Object.assign(document.createElement('div'), { hidden: true });
afterEach(() => vi.useRealTimers());

describe('the wipe into a wild fight', () => {
  it('closes over the world, swaps it for the arena when closed, opens on the arena and hides again: a second in all', () => {
    vi.useFakeTimers();
    const el = cover();
    const switchTo = vi.fn();
    wipe(el, false, switchTo);
    expect([el.hidden, el.dataset.phase, el.dataset.motion]).toEqual([false, 'closing', 'full']);
    vi.advanceTimersByTime(WIPE_MS - 1);
    expect(switchTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(switchTo).toHaveBeenCalledTimes(1);
    expect(el.dataset.phase).toBe('opening');
    vi.advanceTimersByTime(WIPE_MS - 1);
    expect(el.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect([el.hidden, el.dataset.phase]).toEqual([true, undefined]);
    expect(2 * WIPE_MS).toBe(1000);
  });

  it('is a plain fade under reduced motion, shorter than the wipe', () => {
    vi.useFakeTimers();
    const el = cover();
    const switchTo = vi.fn();
    wipe(el, true, switchTo);
    expect(el.dataset.motion).toBe('reduced');
    vi.advanceTimersByTime(FADE_MS);
    expect(switchTo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FADE_MS);
    expect(el.hidden).toBe(true);
    expect(2 * FADE_MS).toBeLessThan(2 * WIPE_MS);
  });
});

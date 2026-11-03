// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { stopLeftIntervals } from './intervals';

describe('stopLeftIntervals (#1487)', () => {
  it('stops an interval a test left running, so it cannot fire after the jsdom teardown', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const stop = stopLeftIntervals();
    setInterval(tick, 1000);
    vi.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(5000);
    expect(tick).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

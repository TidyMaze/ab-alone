import { afterEach, beforeEach } from 'vitest';

/**
 * Remembers every interval started from now on and returns a function that clears them. A test that enters a mode and never leaves
 * it left a real timer running, and it fired after the jsdom teardown ("document is not defined", #1487).
 */
export function stopLeftIntervals(): () => void {
  const real = globalThis.setInterval;
  const ids: ReturnType<typeof setInterval>[] = [];
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const id = real(...args);
    ids.push(id);
    return id;
  }) as typeof setInterval;
  return () => {
    globalThis.setInterval = real;
    for (const id of ids) clearInterval(id);
  };
}

/** Registers the cleanup for every test of the file. */
export function stopLeftIntervalsAfterEach(): void {
  let stop = (): void => {};
  beforeEach(() => {
    stop = stopLeftIntervals();
  });
  afterEach(() => stop());
}

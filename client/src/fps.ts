// The FPS readout (#426): frames per second over the last FPS_WINDOW frame stamps. Pure: main.ts keeps the stamps.
export const FPS_WINDOW = 30;

/** Frames per second over the stamps (ms, oldest first), rounded. 0 when there is no time between two stamps. */
export function fpsOf(stamps: readonly number[]): number {
  const span = stamps.length < 2 ? 0 : stamps[stamps.length - 1]! - stamps[0]!;
  return span > 0 ? Math.round(((stamps.length - 1) * 1000) / span) : 0;
}

/** A new array: the stamps with `now` appended, the oldest dropped past FPS_WINDOW. */
export const keepWindow = (stamps: readonly number[], now: number): number[] => [...stamps, now].slice(-FPS_WINDOW);

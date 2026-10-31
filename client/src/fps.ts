// The FPS readout (#426): frames per second over the last FPS_WINDOW frame stamps. Pure: main.ts keeps the stamps.
export const FPS_WINDOW = 30;

/** Frames per second over the stamps (ms, oldest first), rounded. 0 when there is no time between two stamps. */
export function fpsOf(stamps: readonly number[]): number {
  const span = stamps.length < 2 ? 0 : stamps[stamps.length - 1]! - stamps[0]!;
  return span > 0 ? Math.round(((stamps.length - 1) * 1000) / span) : 0;
}

/** A new array: the stamps with `now` appended, the oldest dropped past FPS_WINDOW. */
export const keepWindow = (stamps: readonly number[], now: number): number[] => [...stamps, now].slice(-FPS_WINDOW);

/** The gap in ms after which a scene that draws nothing reads as idle, not as the rate of its last frames (#1064). */
export const FPS_IDLE_MS = 500;

/** Adds the frame drawn at `now` to the stamps, in place (the Open world draws no array a frame): the oldest is dropped past FPS_WINDOW, and
 * a gap of more than FPS_IDLE_MS since the last drawn frame starts the window over, so a walk after a rest reads its own rate. */
export function stampDrawn(stamps: number[], now: number): void {
  if (stamps.length > 0 && now - stamps[stamps.length - 1]! > FPS_IDLE_MS) stamps.length = 0;
  stamps.push(now);
  if (stamps.length > FPS_WINDOW) stamps.shift();
}

/** Frames per second of the drawn frames as of `now`: 0 once none was drawn for FPS_IDLE_MS, a still scene that is not at 60. */
export const fpsAt = (stamps: readonly number[], now: number): number =>
  stamps.length === 0 || now - stamps[stamps.length - 1]! > FPS_IDLE_MS ? 0 : fpsOf(stamps);

/** The readout of the Open world: the rate, or `idle` when no frame is being drawn (0). */
export const fpsLabel = (fps: number): string => (fps === 0 ? 'idle' : `${fps} FPS`);

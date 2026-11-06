import { MOTION } from './motion';

/** The camera kick of an ejection (#1560): the board's picture is punched in and shaken for at most 250 ms, stronger than
 * any plain move, which has none. It is a zoom about the middle of the window and a shift in pixels, applied to the
 * projection only while the frame is drawn (scene.ts); `unkick` gives the pointer back its place on the resting board. */
export interface Kick {
  zoom: number;
  x: number;
  y: number;
}

export const KICK_MS = 2 * MOTION.fast;
/** The punch: the picture zooms in by this share, fast, and eases back. */
export const KICK_ZOOM = 0.02;
/** The shake: its largest shift in pixels, dying away over three waves across and four up and down. */
export const KICK_PX = 4;
/** The picture at rest. */
export const REST: Kick = { zoom: 1, x: 0, y: 0 };

/** The kick `elapsedMs` after the ejection starts; `REST` before and after, and under reduced motion. It starts from rest. */
export function kickAt(elapsedMs: number, reduced: boolean): Kick {
  if (reduced || elapsedMs < 0 || elapsedMs >= KICK_MS) return REST;
  const t = elapsedMs / KICK_MS;
  const punch = 0.25;
  const u = (t - punch) / (1 - punch);
  const bump = t < punch ? 1 - (1 - t / punch) ** 3 : 1 - u * u * (3 - 2 * u);
  const fade = 1 - t;
  return {
    zoom: 1 + KICK_ZOOM * bump,
    x: KICK_PX * fade * Math.sin(2 * Math.PI * 3 * t),
    y: KICK_PX * 0.6 * fade * Math.sin(2 * Math.PI * 4 * t),
  };
}

/** Where the pointer at (x, y) of a `width` by `height` window is on the resting picture, when the picture drawn is the kicked
 * one: the inverse of the kick, so a click or a hover picks what the player sees. */
export function unkick(kick: Kick, x: number, y: number, width: number, height: number): { x: number; y: number } {
  if (kick === REST) return { x, y };
  return { x: width / 2 + (x - width / 2 - kick.x) / kick.zoom, y: height / 2 + (y - height / 2 - kick.y) / kick.zoom };
}

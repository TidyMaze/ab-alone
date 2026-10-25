/** The blood effect of an ejection (issue #278): a short stylised spatter, just past the steel frame,
 * on the push line. Pure timeline; main.ts draws it. Reduced motion draws nothing (no particles). */
import { FRAME } from './frame';

/** The whole effect, under 1 s, then it ends by itself. */
export const BLOOD_MS = 900;
/** Few, large drops: they read at a glance, then land as small dots on the void. */
export const BLOOD_DROPS = 11;
/** The splash: the drops fly out and fall onto the void in SPLASH_MS, then sit and fade with the stain from FADE_MS. */
const SPLASH_MS = 300;
const FADE_MS = 600;
/** Drops fly within 30 degrees of the push: none flies back over the board, and the wider ones do not reach the
 * marbles on the rim beside the push (their tops project up the screen). */
const SPREAD_RAD = Math.PI / 6;
/** How far a drop flies out, world units. */
const REACH = 1.1;
/** Height of a marble on the board (main.ts holder), and the height the drops land at, on the void. */
const HEIGHT = 0.36;
const LAND_Y = 0.02;

/** The stain's largest radius. */
const STAIN_MAX = 0.35;
/** The spatter starts this far along the push from the rim cell's centre. The frame's outer edge lies FRAME.margin +
 * FRAME.rim past the cell's centre line; the stain's near edge then sits one stain radius beyond it, so the stain
 * (and the marble tops on the rim, which project up the screen) stay clear of the board frame and its marbles. */
const ORIGIN = FRAME.margin + FRAME.rim + 2 * STAIN_MAX + 0.25; // the 0.25: the rim's marble tops are tall on screen

export interface Drop {
  x: number;
  y: number;
  z: number;
  alpha: number;
}

export interface Stain {
  x: number;
  z: number;
  radius: number;
  alpha: number;
}

/** The splash grows in SPLASH_MS (ease out), then holds, then fades to 0 at BLOOD_MS. */
function splashEase(elapsedMs: number): number {
  const splash = Math.min(elapsedMs / SPLASH_MS, 1);
  return 1 - (1 - splash) ** 3;
}

/** 0 while the drops are in the air, 1 once they have landed on the void. */
function landedAt(elapsedMs: number): number {
  return Math.min(Math.max(elapsedMs / SPLASH_MS, 0), 1);
}

function fadeAt(elapsedMs: number): number {
  return 1 - Math.min(Math.max((elapsedMs - FADE_MS) / (BLOOD_MS - FADE_MS), 0), 1);
}

/** The drops `elapsedMs` after an ejection at `from` pushed along the unit `dir` (board plane).
 * Empty under reduced motion, and from BLOOD_MS on. Alpha starts at 1 and only falls. */
export function bloodAt(
  from: { x: number; z: number },
  dir: { x: number; z: number },
  elapsedMs: number,
  reducedMotion: boolean,
): Drop[] {
  // A frame timestamp can precede the start: clamp to 0, as trackAt does for the marble.
  elapsedMs = Math.max(elapsedMs, 0);
  if (reducedMotion || elapsedMs >= BLOOD_MS) return [];
  const ox = from.x + dir.x * ORIGIN;
  const oz = from.z + dir.z * ORIGIN;
  const ease = splashEase(elapsedMs);
  const y = LAND_Y + (HEIGHT - LAND_Y) * (1 - landedAt(elapsedMs)) ** 2;
  const alpha = fadeAt(elapsedMs);
  return Array.from({ length: BLOOD_DROPS }, (_, i) => {
    const spin = frac((i + 1) * 0.618);
    const angle = (spin - 0.5) * 2 * SPREAD_RAD;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const reach = REACH * (0.4 + 0.6 * frac((i + 1) * 0.37)) * ease;
    const u = { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c }; // the push, turned by angle
    return { x: ox + u.x * reach, y, z: oz + u.z * reach, alpha };
  });
}

/** The stain on the void under the splash, same centre as the drops: it spreads with the splash,
 * then fades with them. Null under reduced motion, and from BLOOD_MS on. */
export function bloodStainAt(
  from: { x: number; z: number },
  dir: { x: number; z: number },
  elapsedMs: number,
  reducedMotion: boolean,
): Stain | null {
  elapsedMs = Math.max(elapsedMs, 0);
  if (reducedMotion || elapsedMs >= BLOOD_MS) return null;
  return {
    x: from.x + dir.x * ORIGIN,
    z: from.z + dir.z * ORIGIN,
    radius: STAIN_MAX * splashEase(elapsedMs),
    alpha: fadeAt(elapsedMs),
  };
}

function frac(x: number): number {
  return x - Math.floor(x);
}

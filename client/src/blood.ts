/** The blood effect of an ejection (issue #278): a short stylised spatter, just beyond the rim, on
 * the push line. Pure timeline; main.ts draws it. Reduced motion draws nothing (no particles). */

/** The whole effect, under 1 s, then it ends by itself. */
export const BLOOD_MS = 900;
export const BLOOD_DROPS = 18;
/** The splash: the drops fly out in this time, then hang, then fade. */
const SPLASH_MS = 300;
const HOLD_UNTIL_MS = 600;
/** Drops fly within 60 degrees of the push, so none flies back over the board. */
const SPREAD_RAD = Math.PI / 3;
/** How far a drop flies out, world units, and how far it drips down (in the void, under the rim). */
const REACH = 0.9;
const DRIP = 0.6;
/** Height of a marble on the board (main.ts holder). */
const HEIGHT = 0.36;

export interface Drop {
  x: number;
  y: number;
  z: number;
  alpha: number;
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
  // The spatter starts one cell-centre out, beyond the rim: nothing is drawn over a cell.
  const ox = from.x + dir.x;
  const oz = from.z + dir.z;
  const splash = Math.min(elapsedMs / SPLASH_MS, 1);
  const ease = 1 - (1 - splash) ** 3;
  const drip = Math.max(elapsedMs - SPLASH_MS, 0) / 1000;
  const alpha = 1 - Math.min(Math.max((elapsedMs - HOLD_UNTIL_MS) / (BLOOD_MS - HOLD_UNTIL_MS), 0), 1);
  return Array.from({ length: BLOOD_DROPS }, (_, i) => {
    const spin = frac((i + 1) * 0.618);
    const angle = (spin - 0.5) * 2 * SPREAD_RAD;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const reach = REACH * (0.4 + 0.6 * frac((i + 1) * 0.37)) * ease;
    const u = { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c }; // the push, turned by angle
    return {
      x: ox + u.x * reach,
      y: HEIGHT - DRIP * drip * drip,
      z: oz + u.z * reach,
      alpha,
    };
  });
}

function frac(x: number): number {
  return x - Math.floor(x);
}

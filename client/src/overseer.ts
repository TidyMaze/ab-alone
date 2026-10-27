// The Overseer (docs/specs/game-design.md section 7.11, #635): an immovable Overseer at the centre, 6 cores both sides
// push, 6 incinerator vents on the rim that burn them, and a neurotoxin clock. Pure helpers over the bridge's
// `removed()` and `turns_left()`; the meshes and the burn effect live in main.ts.
import { axialTo3D, type Axial } from './board';
import { EJECT_MS, FADE_MS, type EjectTrack } from './eject';

/** The player turns of the fight, the engine's OVERSEER_TURNS. */
export const TOXIN_TURNS = 40;
/** The Overseer's line, one per 20 % of neurotoxin. */
export const TAUNTS: readonly string[] = [
  'Take your time. The neurotoxin will wait.',
  'The neurotoxin is now at a level we call festive.',
  'You are doing very well. For a corpse.',
  'Most test subjects stop moving around now.',
  'Goodbye. I mean it this time.',
];

/** A marble the vents burnt in the last ply: its cell and its board code (`8` a core). */
export interface Burn {
  cell: Axial;
  side: number;
}

/** Splits the flat `[q, r, code]` records of `Encounter.removed()`. */
export function parseBurns(flat: ArrayLike<number>): Burn[] {
  if (flat.length % 3 !== 0) throw new Error(`removed array length ${flat.length} is not a multiple of 3`);
  const all = Array.from(flat);
  return Array.from({ length: all.length / 3 }, (_, i) => ({ cell: [all[3 * i]!, all[3 * i + 1]!], side: all[3 * i + 2]! }));
}

/** The index of the taunt of the clock, one per 20 % of neurotoxin; -1 for a fight with none (`left` is `-1`). */
export function tauntIndex(left: number): number {
  if (left < 0) return -1;
  const level = Math.round(((TOXIN_TURNS - left) * 100) / TOXIN_TURNS);
  return Math.min(TAUNTS.length - 1, Math.floor(level / 20));
}

/** HUD line of the clock, '' for a fight with none (`left` is `-1`): "Neurotoxin 25 % · 30 turns left · <taunt>". */
export function toxinText(left: number): string {
  if (left < 0) return '';
  const level = Math.round(((TOXIN_TURNS - left) * 100) / TOXIN_TURNS);
  return `Neurotoxin ${level} % · ${left} ${left === 1 ? 'turn' : 'turns'} left · ${TAUNTS[tauntIndex(left)]}`;
}

/** Whether the vents burn the player's marbles in phase `phase` (0 is P1): in P2 and P3; the boss's burn in P1 and P2. */
export const burnsPlayer = (phase: number): boolean => phase >= 1;

/** Whether the change from phase `from` to `to` is the one that starts burning the player's marbles. */
export const startsBurningPlayer = (from: number, to: number): boolean => !burnsPlayer(from) && burnsPlayer(to);

/** The one-line HUD note of that change, shown for 2 plies from the ply it happened at. */
export const VENT_NOTE = 'The vents now burn your marbles too.';
export const ventNote = (since: number, ply: number): string => (since >= 0 && ply - since < 2 ? VENT_NOTE : '');

/** Haze puffs per vent, and the seconds one puff takes to rise. */
export const HAZE_PER_VENT = 3;
export const HAZE_MS = 3000;

/** A toxic puff `k` (a fraction of a cycle apart) `nowMs` into the haze: its height, scale and opacity. It rises,
 * widens and fades in and out in a loop; reduced motion: one faint puff held at mid-height. */
export function hazeAt(nowMs: number, k: number, reduced: boolean): { y: number; scale: number; opacity: number } {
  const t = reduced ? 0.5 : (((nowMs / HAZE_MS + k) % 1) + 1) % 1;
  return { y: 0.15 + 0.9 * t, scale: 0.5 + 0.5 * t, opacity: (reduced ? 0.35 : 0.55) * Math.sin(Math.PI * t) };
}

/** Where the Overseer's bubble points: over its pedestal and eye, on the centre cell. */
export const BUBBLE_SPOT = { x: 0, y: 1.2, z: 0 };

/** The effect of a burning marble: it sinks into its vent where it stands, or fades with reduced motion. */
export function burnTrack(cell: Axial, reduced: boolean): EjectTrack {
  const p = axialTo3D(cell[0], cell[1]);
  return {
    kind: reduced ? 'fade' : 'tumble',
    from: { x: p.x, z: p.z },
    dir: { x: 0, z: 0 },
    durationMs: reduced ? FADE_MS : EJECT_MS,
  };
}

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

/** HUD line of the clock, '' for a fight with none (`left` is `-1`): "Neurotoxin 25 % · 30 turns left · <taunt>". */
export function toxinText(left: number): string {
  if (left < 0) return '';
  const level = Math.round(((TOXIN_TURNS - left) * 100) / TOXIN_TURNS);
  const taunt = TAUNTS[Math.min(TAUNTS.length - 1, Math.floor(level / 20))]!;
  return `Neurotoxin ${level} % · ${left} ${left === 1 ? 'turn' : 'turns'} left · ${taunt}`;
}

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

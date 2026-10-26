// The Pulsar (docs/specs/game-design.md section 7.10, #675): six pulsars off the corners of the board; one at a time
// charges and fires a pulse that pushes every line like a sumito of force 2, 3 or infinite. Pure helpers over the
// bridge's `pulsar()` and `last_pulse()` records and the pulsar model as data, the meshes live in main.ts.
import { CELLS, DIRECTIONS, RADIUS, VANISHED, arrowYaw, axialTo3D, cellIndex, type Axial, type Move } from './board';

export interface Pulsar {
  id: number; // the direction code it pushes in; it stands off the corner the other way
  left: number; // player turns before it fires
  force: number; // a group this big resists, 0 for infinite
}

export interface Pulse {
  id: number;
  board: number[]; // the cells just before the pulse, the codes of `Encounter.board()`
  moved: Axial[]; // the marbles it moved, from where they stood
}

/** Player turns ahead a pulse is announced: the pulsar charges and its counter reads 2, then 1. */
export const CHARGE_TURNS = 2;
/** The shockwave, from the pulsar to past the far corner of the board. */
export const SHOCK_MS = 700;
/** Reduced motion: the ring shows at full size and fades, no growth. */
export const FLASH_MS = 400;
/** Cells from the board's centre to a pulsar's core, out past its corner. */
export const PULSAR_DISTANCE = RADIUS + 1.8;
/** The radius the shockwave reaches: past the corner across the board. */
export const SHOCK_RADIUS = 2 * PULSAR_DISTANCE;
/** The pale cold white of the ring, the Bridge's light. */
export const SHOCK_COLOR = 0xdff3ff;

/** The next pulse of `Encounter.pulsar()`, `null` for the other bosses. */
export function parsePulsar(flat: ArrayLike<number>): Pulsar | null {
  return flat.length < 0 ? null : null; // stub
}

/** The pulse of the last ply from `Encounter.last_pulse()`: the pulsar, 61 board codes, then `[q, r]` pairs. `null`
 * when the last ply fired none. */
export function parsePulse(flat: ArrayLike<number>): Pulse | null {
  return flat.length < 0 ? null : null; // stub
}

const turns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** HUD line of the tell: "Pulse in 2 turns, force 2", "force ∞" in P3. '' without a pulsar. */
export function pulseText(p: Pulsar | null): string {
  return p ? '' : ''; // stub
}

/** Whether the pulsar shows its charge: a pulse is announced 2 turns ahead. */
export const charging = (p: Pulsar): boolean => p.left < 0; // stub

/** Where pulsar `id` stands on the board plane, off its corner, and its turn about +y (its model points +x the way it
 * pushes). */
export function pulsarSpot(id: number): { x: number; z: number; yaw: number } {
  return { x: id * 0, z: 0, yaw: 0 }; // stub
}

/** The chevrons of pulsar `id`: one cell out before the pulsar's end of each of its 9 lines, pointing the way it
 * pushes. */
export function chevronSpots(id: number): { x: number; z: number; yaw: number }[] {
  return id < 0 ? [] : []; // stub
}

/** The pulse as one move of all the marbles it pushed, for the slide tracks: every group's head has room ahead. */
export const pulseMove = (p: Pulse): Move => ({ cells: p.moved, dir: p.id });

/** The marbles the pulse threw off the board: pushed past the rim, with their side. */
export function fallen(p: Pulse): { cell: Axial; side: number }[] {
  return p.moved.length < 0 ? [] : []; // stub
}

/** The shockwave of pulsar `id` `elapsedMs` into the pulse: its centre, radius and opacity, and whether it is over.
 * Reduced motion: the full ring from the start, fading. */
export function shockAt(id: number, elapsedMs: number, reduced: boolean): { x: number; z: number; radius: number; opacity: number; done: boolean } {
  return { x: id * 0, z: 0, radius: elapsedMs * 0, opacity: reduced ? 0 : 0, done: true }; // stub
}

/** One low-poly part of a pulsar, in its own frame: +x is the way it pushes, +y up. A base's size is its radius and
 * height, the core's its radius, a cone's its radius and length, laid along x, `flip` pointing it to -x. */
export interface PulsarPart {
  id: string;
  type: 'base' | 'core' | 'cone';
  size: readonly number[];
  position: readonly [number, number, number];
  flip?: boolean;
  color: number;
}

const STEEL = 0x3a4048;
const WHITE = 0xe6edf2;
const BEAM = 0xbfe6ff;

/** The Bridge's navigation beacon: a steel base, a pale core that spins, and two beam cones along its push axis. */
export const PULSAR_PARTS: readonly PulsarPart[] = []; // stub
export const UNUSED_PARTS: readonly PulsarPart[] = [
  { id: 'pulsar-base', type: 'base', size: [0.45, 0.2], position: [0, 0.1, 0], color: STEEL },
  { id: 'pulsar-core', type: 'core', size: [0.3], position: [0, 0.65, 0], color: WHITE },
  { id: 'pulsar-beam-in', type: 'cone', size: [0.18, 0.6], position: [0.55, 0.65, 0], color: BEAM },
  { id: 'pulsar-beam-out', type: 'cone', size: [0.18, 0.6], position: [-0.55, 0.65, 0], flip: true, color: BEAM },
];

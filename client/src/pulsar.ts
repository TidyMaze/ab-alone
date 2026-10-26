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
export const PULSAR_DISTANCE = RADIUS + 1.3;
/** The radius the shockwave reaches: past the corner across the board. */
export const SHOCK_RADIUS = 2 * PULSAR_DISTANCE;
/** The pale cold white of the ring, the Bridge's light. */
export const SHOCK_COLOR = 0xdff3ff;

/** The next pulse of `Encounter.pulsar()`, `null` for the other bosses. */
export function parsePulsar(flat: ArrayLike<number>): Pulsar | null {
  if (flat.length === 0) return null;
  return { id: flat[0]!, left: flat[1]!, force: flat[2]! };
}

/** The pulse of the last ply from `Encounter.last_pulse()`: the pulsar, 61 board codes, then `[q, r]` pairs. `null`
 * when the last ply fired none. */
export function parsePulse(flat: ArrayLike<number>): Pulse | null {
  if (flat.length === 0) return null;
  const all = Array.from(flat);
  const moved: Axial[] = [];
  for (let i = 62; i < all.length; i += 2) moved.push([all[i]!, all[i + 1]!]);
  return { id: all[0]!, board: all.slice(1, 62), moved };
}

const turns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** HUD line of the tell: "Pulse in 2 turns, force 2", "force ∞" in P3. '' without a pulsar. */
export function pulseText(p: Pulsar | null): string {
  return p ? `Pulse in ${turns(p.left)}, force ${p.force === 0 ? '∞' : p.force}` : '';
}

/** The ripples of a pulsar that fires next turn (#741): two small faint rings in a loop. */
export const RIPPLES = 2;
export const RIPPLE_MS = 1600;
export const RIPPLE_RADIUS = 1.4;
export const RIPPLE_OPACITY = 0.4;

/** Whether the pulsar fires on the player's next move: it ripples while they think. */
export const rippling = (p: Pulsar): boolean => p.left === 1;

/** Ring `k` of a rippling pulsar `nowMs` into the page: its radius and opacity. The rings are half a cycle apart;
 * reduced motion: the first is one static faint ring, the others are not drawn. */
export function rippleAt(nowMs: number, k: number, reduced: boolean): { radius: number; opacity: number } {
  if (reduced) return { radius: RIPPLE_RADIUS * 0.6, opacity: k === 0 ? RIPPLE_OPACITY * 0.8 : 0 };
  const t = (nowMs / RIPPLE_MS + k / RIPPLES) % 1;
  return { radius: RIPPLE_RADIUS * t, opacity: RIPPLE_OPACITY * (1 - t) };
}

/** Whether the pulsar shows its charge: a pulse is announced 2 turns ahead. */
export const charging = (p: Pulsar): boolean => p.left <= CHARGE_TURNS;

/** Where pulsar `id` stands on the board plane, off its corner, and its turn about +y (its model points +x the way it
 * pushes). */
export function pulsarSpot(id: number): { x: number; z: number; yaw: number } {
  const [dq, dr] = DIRECTIONS[id]!;
  const corner = axialTo3D(-dq, -dr);
  return { x: corner.x * PULSAR_DISTANCE, z: corner.z * PULSAR_DISTANCE, yaw: arrowYaw(id) };
}

/** The world size of the counter a charging pulsar shows. */
export const PULSE_COUNTER_SIZE = 0.5;

/** Where the counter of pulsar `id` stands while it charges: above its core. */
export function counterSpot(id: number): { x: number; y: number; z: number } {
  const { x, z } = pulsarSpot(id);
  return { x, y: 1.35, z };
}

/** Points round a pulsar in its own frame, the model main.ts builds from PULSAR_PARTS: the tips of its beam cones, the
 * top of its core and the foot of its base, which flares to a radius of 0.54. */
const OUTLINE: readonly [number, number, number][] = [
  [0.85, 0.65, 0],
  [-0.85, 0.65, 0],
  [0, 0.95, 0],
  ...Array.from({ length: 12 }, (_, k): [number, number, number] => [0.54 * Math.cos((k * Math.PI) / 6), 0, 0.54 * Math.sin((k * Math.PI) / 6)]),
];

/** Points round the six pulsars as they stand and the counter above each, a box round its sprite (#691): the camera of
 * a Pulsar fight fits them in the window. */
export const PULSAR_BOUNDS: readonly { x: number; y: number; z: number }[] = [0, 1, 2, 3, 4, 5].flatMap((id) => {
  const { x, z, yaw } = pulsarSpot(id);
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  const model = OUTLINE.map(([px, py, pz]) => ({ x: x + px * cos + pz * sin, y: py, z: z - px * sin + pz * cos }));
  const c = counterSpot(id);
  const h = PULSE_COUNTER_SIZE / 2;
  const counter = [-h, h].flatMap((dx) => [-h, h].flatMap((dy) => [-h, h].map((dz) => ({ x: c.x + dx, y: c.y + dy, z: c.z + dz }))));
  return [...model, ...counter];
});

/** The chevrons of pulsar `id`: one cell out before the pulsar's end of each of its 9 lines, pointing the way it
 * pushes. */
export function chevronSpots(id: number): { x: number; z: number; yaw: number }[] {
  const [dq, dr] = DIRECTIONS[id]!;
  return CELLS.filter(([q, r]) => cellIndex(q - dq, r - dr, CELLS) === -1).map(([q, r]) => {
    const { x, z } = axialTo3D(q - dq, r - dr);
    return { x, z, yaw: arrowYaw(id) };
  });
}

/** The pulse as one move of all the marbles it pushed, for the slide tracks: every group's head has room ahead. */
export const pulseMove = (p: Pulse): Move => ({ cells: p.moved, dir: p.id });

/** The marbles the pulse threw off the board: pushed past the rim, with their side. */
export function fallen(p: Pulse): { cell: Axial; side: number }[] {
  const [dq, dr] = DIRECTIONS[p.id]!;
  return p.moved
    .filter(([q, r]) => (p.board[cellIndex(q + dq, r + dr)] ?? VANISHED) === VANISHED)
    .map((cell) => ({ cell, side: p.board[cellIndex(...cell)]! }));
}

/** The shockwave of pulsar `id` `elapsedMs` into the pulse: its centre, radius and opacity, and whether it is over.
 * Reduced motion: the full ring from the start, fading. */
export function shockAt(id: number, elapsedMs: number, reduced: boolean): { x: number; z: number; radius: number; opacity: number; done: boolean } {
  const { x, z } = pulsarSpot(id);
  const t = Math.min(1, Math.max(0, elapsedMs) / (reduced ? FLASH_MS : SHOCK_MS));
  return { x, z, radius: reduced ? SHOCK_RADIUS : SHOCK_RADIUS * (1 - (1 - t) ** 2), opacity: 0.85 * (1 - t), done: t >= 1 };
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
export const PULSAR_PARTS: readonly PulsarPart[] = [
  { id: 'pulsar-base', type: 'base', size: [0.45, 0.2], position: [0, 0.1, 0], color: STEEL },
  { id: 'pulsar-core', type: 'core', size: [0.3], position: [0, 0.65, 0], color: WHITE },
  { id: 'pulsar-beam-in', type: 'cone', size: [0.18, 0.6], position: [0.55, 0.65, 0], color: BEAM },
  { id: 'pulsar-beam-out', type: 'cone', size: [0.18, 0.6], position: [-0.55, 0.65, 0], flip: true, color: BEAM },
];

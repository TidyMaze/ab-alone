// The Assembly Line (docs/specs/game-design.md section 7.12, #744): three conveyor belts on the middle rows carry every
// marble on them one cell per turn and drop it off the end; in P3 their presses strike announced slots. Pure helpers over
// the bridge's `belts()` and `last_belts()` records and the belt models as data, the meshes live in main.ts.
import { axialTo3D, cellIndex, type Axial, type Move } from './board';

export interface Belt {
  cells: Axial[]; // from the lowest q
  dir: number; // 1 toward +q, -1 toward -q, 0 when it does not run
  shift: number; // how far its pattern has scrolled toward +q
  strike: number; // the index of the cell the press strikes after the next move, -1 for none
}

export interface Belts {
  left: number; // player turns left before the centre belt reverses, the next one counted
  belts: Belt[]; // the centre belt first
}

/** What a turn of the belts did to one marble: carried from `from` to `to`, fell off the end past `to`, or was struck. */
export interface Carry {
  from: Axial;
  to: Axial;
  fate: 'carried' | 'fell' | 'struck';
  side: number; // the board code of the marble
}

const BELT_STRIDE = 6;
const CARRY_STRIDE = 6;
const FATES = ['carried', 'fell', 'struck'] as const;

/** The red of a strike slot that is announced: 3:1 and more on the belt's near-black surface. */
export const STRIKE_COLOR = 0xe0452f;
/** The press comes down in this long, then goes back up. Reduced motion: no slam. */
export const SLAM_MS = 450;
/** The red of the announced slot swells and fades over this long, slowly: under 3 times a second (world.md section 8). */
export const BLINK_MS = 1200;
/** The belt surface scrolls this many cells a second. */
export const SCROLL_CELLS_PER_S = 0.5;
/** Distance between two ribs of the belt surface, in cells. */
export const RIB_SPACING = 0.5;

/** The belts of `Encounter.belts()`: `[turns_left, ...one record of 6 per belt]`, `null` for the other bosses. */
export function parseBelts(flat: ArrayLike<number>): Belts | null {
  if (flat.length === 0) return null;
  if ((flat.length - 1) % BELT_STRIDE !== 0) {
    throw new Error(`belt array length ${flat.length} is not 1 plus a multiple of ${BELT_STRIDE}`);
  }
  const belts: Belt[] = [];
  for (let i = 1; i < flat.length; i += BELT_STRIDE) {
    const [row, q0, len, dir, shift, strike] = Array.from({ length: BELT_STRIDE }, (_, k) => flat[i + k]!);
    belts.push({ cells: Array.from({ length: len! }, (_, k): Axial => [q0! + k, row!]), dir: dir!, shift: shift!, strike: strike! });
  }
  return { left: flat[0]!, belts };
}

/** Whether cell `index` of a belt of `len` cells scrolled by `shift` shows a strike slot: the slots alternate plain,
 * strike from slot 0 and scroll with the belt. */
export const isStrikeSlot = (len: number, shift: number, index: number): boolean => ((index + len - (shift % len)) % len) % 2 === 1;

const turns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** HUD line of the tell: "Belts reverse in 3 turns", with " · press strikes next turn" while a strike is announced. ''
 * without belts. */
export function beltText(b: Belts | null): string {
  if (!b) return '';
  const strike = b.belts.some((belt) => belt.strike >= 0);
  return `Belts reverse in ${turns(b.left)}${strike ? ' · press strikes next turn' : ''}`;
}

/** The marbles the last ply's belts touched, from `Encounter.last_belts()`. */
export function parseCarries(flat: ArrayLike<number>): Carry[] {
  if (flat.length % CARRY_STRIDE !== 0) {
    throw new Error(`carry array length ${flat.length} is not a multiple of ${CARRY_STRIDE}`);
  }
  const carries: Carry[] = [];
  for (let i = 0; i < flat.length; i += CARRY_STRIDE) {
    const [q, r, tq, tr, fate, side] = Array.from({ length: CARRY_STRIDE }, (_, k) => flat[i + k]!);
    carries.push({ from: [q!, r!], to: [tq!, tr!], fate: FATES[fate!]!, side: side! });
  }
  return carries;
}

/** The board just before the belts moved: the engine's board with each carried or fallen marble back on its cell. A
 * struck marble is back through its carry. */
export function beforeBelts(after: ArrayLike<number>, carries: readonly Carry[]): number[] {
  const board = Array.from(after);
  const moving = carries.filter((c) => c.fate !== 'struck');
  for (const c of moving) if (c.fate === 'carried') board[cellIndex(...c.to)] = 0;
  for (const c of moving) board[cellIndex(...c.from)] = c.side;
  return board;
}

/** The turn of the belts as moves for the slide tracks, one per direction (E `0`, W `1`): the marbles each carried or
 * dropped. */
export function beltMoves(carries: readonly Carry[]): Move[] {
  return [0, 1]
    .map((dir) => ({
      cells: carries.filter((c) => c.fate !== 'struck' && (c.to[0] > c.from[0] ? 0 : 1) === dir).map((c) => c.from),
      dir,
    }))
    .filter((m) => m.cells.length > 0);
}

/** The marbles that fell off the end of a belt, with the direction they went. */
export function fellOff(carries: readonly Carry[]): { cell: Axial; side: number; dir: number }[] {
  return carries.filter((c) => c.fate === 'fell').map((c) => ({ cell: c.from, side: c.side, dir: c.to[0] > c.from[0] ? 0 : 1 }));
}

/** The marbles a press destroyed, on the cell they stood on. */
export function struckBy(carries: readonly Carry[]): { cell: Axial; side: number }[] {
  return carries.filter((c) => c.fate === 'struck').map((c) => ({ cell: c.from, side: c.side }));
}

/** The board plane position of a cell. */
const spot = ([q, r]: Axial): { x: number; z: number } => axialTo3D(q, r);

/** The middle and length of a belt on the board plane, a cell out past each end for the rollers. */
export function beltSpan(belt: Belt): { x: number; z: number; length: number } {
  const [a, b] = [spot(belt.cells[0]!), spot(belt.cells[belt.cells.length - 1]!)];
  return { x: (a.x + b.x) / 2, z: a.z, length: belt.cells.length + 1 };
}

/** Where the two rollers of a belt turn: half a cell past each end cell. */
export function rollerSpots(belt: Belt): { x: number; z: number }[] {
  const [a, b] = [spot(belt.cells[0]!), spot(belt.cells[belt.cells.length - 1]!)];
  return [
    { x: a.x - 0.55, z: a.z },
    { x: b.x + 0.55, z: b.z },
  ];
}

/** Where the plates of the strike slots lie: the cells whose slot is a strike slot, `strike` flagging the announced one. */
export function plateSpots(belt: Belt): { x: number; z: number; strike: boolean }[] {
  return belt.cells.flatMap((cell, i) =>
    isStrikeSlot(belt.cells.length, belt.shift, i) ? [{ ...spot(cell), strike: i === belt.strike }] : [],
  );
}

/** Where the chevrons of a running belt lie, one per cell, and the direction code each points (E `0`, W `1`). */
export function chevronSpots(belt: Belt): { x: number; z: number; dir: number }[] {
  return belt.dir === 0 ? [] : belt.cells.map((cell) => ({ ...spot(cell), dir: belt.dir > 0 ? 0 : 1 }));
}

/** Where the counter of the turns left stands: beyond the east end of the centre belt, over its roller. */
export function counterSpot(belt: Belt): { x: number; y: number; z: number } {
  const { x, z } = rollerSpots(belt)[1]!;
  return { x: x + 0.45, y: 0.75, z };
}

/** The ribs of the surface of a belt `nowMs` into the scroll: their offsets from the belt's middle along it, wrapping at
 * its length, running the way the belt does. Reduced motion or a belt at rest: still. */
export function ribOffsets(belt: Belt, nowMs: number, reduced: boolean): number[] {
  const span = belt.cells.length + 1;
  const phase = reduced ? 0 : (nowMs / 1000) * SCROLL_CELLS_PER_S * belt.dir;
  return Array.from({ length: span / RIB_SPACING }, (_, k) => ((((k * RIB_SPACING + phase) % span) + span) % span) - span / 2);
}

/** How strong the red of an announced slot glows `nowMs` in, 0.55 to 1; steady under reduced motion. */
export function blinkAt(nowMs: number, reduced: boolean): number {
  return reduced ? 1 : 0.775 + 0.225 * Math.sin((2 * Math.PI * nowMs) / BLINK_MS);
}

/** The height of the press `elapsedMs` into its strike: down onto the plate in the first third, then back up. Reduced
 * motion: it stays up, and the effect ends at once. */
export function slamAt(elapsedMs: number, reduced: boolean): { y: number; done: boolean } {
  const [top, bottom] = [1.1, 0.2];
  if (reduced) return { y: top, done: true };
  const t = Math.min(1, Math.max(0, elapsedMs) / SLAM_MS);
  const y = t < 1 / 3 ? top + (bottom - top) * (3 * t) ** 2 : bottom + (top - bottom) * ((t - 1 / 3) * 1.5);
  return { y, done: t >= 1 };
}

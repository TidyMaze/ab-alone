// The Rail Yard tell (docs/specs/game-design.md section 7.8, #626): a freight train announced on a whole line of the
// board, chevrons and a counter of the player turns left, then its pass, which knocks every marble on the line off.
// Pure helpers over the bridge's `trains()` records and the train model as data, the meshes live in main.ts.
import { DIRECTIONS, VANISHED, arrowYaw, axialTo3D, cellIndex, isMarble, type Axial, type Move } from './board';
import { pushedCells } from './slide';

export interface Train {
  line: number;
  left: number; // player turns before it passes
  cells: Axial[]; // the line in the order the train runs it, the entry cell first
  dir: number; // the direction code it runs in
}

const TRAIN_STRIDE = 6;
/** Player turns from the announce to the pass: the counter's highest value. */
export const TRAIN_LEAD = 5;
/** The pass, from the train coming in to its last wagon gone: under the 1.5 s of an ejection plus the run. */
export const PASS_MS = 1600;
/** Reduced motion: the train shows at the entry, then jumps past the exit at half time, no slide. */
export const JUMP_MS = 500;
/** Cells of rails before the entry and after the exit, where the train comes from and goes to. */
export const APPROACH = 3;
/** The hazard amber of the chevrons, 3:1 and more on the deck's steel and the near-black frame. */
export const CHEVRON_COLOR = 0xf0a830;
/** A flat chevron pointing +x, on the board plane (x, z), half a cell wide. */
export const CHEVRON_SHAPE: readonly [number, number][] = [
  [-0.16, -0.24],
  [0.02, -0.24],
  [0.2, 0],
  [0.02, 0.24],
  [-0.16, 0.24],
  [0.02, 0],
];

/** The Cargo hold's freight train: a locomotive, then ore wagons, in rust, hauler paint and ore dust. */
const PAINT = 0xb7792a;
const CAB = 0x7a4a1e;
const IRON = 0x2a2d30;
const RUST = 0x5e3a26;
const ORE = 0x4a4038;
const LAMP = 0xd8d4c8;
const WAGONS = 2;
const LOCO = 1.3;
const WAGON = 1;
const GAP = 0.12;
/** Length of the whole train, in cells. */
export const TRAIN_LENGTH = LOCO + WAGONS * (GAP + WAGON);

/** Splits the flat `[line, player_turns_left, entry_q, entry_r, exit_q, exit_r]` records of `Encounter.trains()`. */
export function parseTrains(flat: ArrayLike<number>): Train[] {
  if (flat.length % TRAIN_STRIDE !== 0) {
    throw new Error(`train array length ${flat.length} is not a multiple of ${TRAIN_STRIDE}`);
  }
  const trains: Train[] = [];
  for (let i = 0; i < flat.length; i += TRAIN_STRIDE) {
    const [line, left, eq, er, xq, xr] = Array.from({ length: TRAIN_STRIDE }, (_, k) => flat[i + k]!);
    const length = Math.max(Math.abs(xq! - eq!), Math.abs(xr! - er!));
    const step: Axial = [(xq! - eq!) / length, (xr! - er!) / length];
    const cells = Array.from({ length: length + 1 }, (_, k): Axial => [eq! + k * step[0], er! + k * step[1]]);
    const dir = DIRECTIONS.findIndex(([dq, dr]) => dq === step[0] && dr === step[1]);
    trains.push({ line: line!, left: left!, cells, dir });
  }
  return trains;
}

const turns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** HUD fallback of the tell, '' without trains: "Trains pass: 1 in 2 turns · 1 in 5 turns". */
export function trainText(trains: readonly Train[]): string {
  if (trains.length === 0) return '';
  const parts = [...trains].sort((a, b) => a.left - b.left).map((t) => `1 in ${turns(t.left)}`);
  return `Trains pass: ${parts.join(' · ')}`;
}

/** The trains that passed between two reads of the bridge: on 1 before, and no longer on 1 on their line after. A train
 * announced on the line it just cleared starts on 5, and a fight that ended on the player's move keeps its trains. */
export function passedTrains(before: readonly Train[], after: readonly Train[]): Train[] {
  return before.filter((t) => t.left === 1 && !after.some((a) => a.line === t.line && a.left === 1));
}

/** The marbles the pass of `train` knocks off: the ones on its line once `mv` is played on `before`, in the order the
 * train reaches them, with their index on the line. */
export function knockedMarbles(
  before: ArrayLike<number>,
  mv: Move,
  train: Train,
): { cell: Axial; side: number; at: number }[] {
  const board = Array.from(before);
  const moved = pushedCells(before, mv);
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  for (const [q, r] of moved) board[cellIndex(q, r)] = 0;
  for (const [q, r] of moved) {
    const to = cellIndex(q + dq, r + dr);
    if (to !== -1 && to < board.length && board[to] !== VANISHED) board[to] = before[cellIndex(q, r)]!;
  }
  return train.cells.flatMap((cell, at) => {
    const side = board[cellIndex(...cell)];
    return isMarble(side) ? [{ cell, side: side!, at }] : [];
  });
}

/** Front of the train `elapsedMs` into its pass, in cells along the line from the entry cell: from `APPROACH` before
 * it to the whole train past the exit. Reduced motion: the start, then the end at half time. */
function frontAt(train: Train, elapsedMs: number, reduced: boolean): number {
  const [from, to] = [-APPROACH, train.cells.length - 1 + APPROACH + TRAIN_LENGTH];
  if (reduced) return elapsedMs < JUMP_MS / 2 ? from : to;
  return from + (to - from) * Math.min(1, Math.max(0, elapsedMs) / PASS_MS);
}

/** The train `elapsedMs` into its pass: where its front is on the board plane, its turn about +y (its model runs
 * along +x), and whether the pass is over. */
export function trainAt(train: Train, elapsedMs: number, reduced: boolean): { x: number; z: number; yaw: number; done: boolean } {
  const s = frontAt(train, elapsedMs, reduced);
  const entry = axialTo3D(...train.cells[0]!);
  const step = axialTo3D(...DIRECTIONS[train.dir]!);
  return {
    x: entry.x + step.x * s,
    z: entry.z + step.z * s,
    yaw: arrowYaw(train.dir),
    done: elapsedMs >= (reduced ? JUMP_MS : PASS_MS),
  };
}

/** When, into the pass, the train reaches the marble on cell `at` of its line: the front a marble's radius short of
 * the cell's centre. Reduced motion: at the jump. */
export function reachMs(train: Train, at: number, reduced: boolean): number {
  if (reduced) return JUMP_MS / 2;
  const run = train.cells.length - 1 + 2 * APPROACH + TRAIN_LENGTH;
  return (PASS_MS * (APPROACH + at - 0.36)) / run;
}

/** Where the chevrons of `train` lie, each pointing the way it runs: the two board edges, one cell out past the entry
 * and the exit (`edge`), and every cell of the line. */
export function chevronSpots(train: Train): { x: number; z: number; yaw: number; edge: boolean }[] {
  const [dq, dr] = DIRECTIONS[train.dir]!;
  const first = train.cells[0]!;
  const last = train.cells[train.cells.length - 1]!;
  const spot = ([q, r]: Axial, edge: boolean) => {
    const { x, z } = axialTo3D(q, r);
    return { x, z, yaw: arrowYaw(train.dir), edge };
  };
  return [
    spot([first[0] - dq, first[1] - dr], true),
    ...train.cells.map((c) => spot(c, false)),
    spot([last[0] + dq, last[1] + dr], true),
  ];
}

/** The rails of `train`: their middle and length on the board plane, along the line from `APPROACH` cells before the
 * entry to `APPROACH` after the exit. */
export function railSpan(train: Train): { x: number; z: number; yaw: number; length: number } {
  const a = axialTo3D(...train.cells[0]!);
  const b = axialTo3D(...train.cells[train.cells.length - 1]!);
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    yaw: arrowYaw(train.dir),
    length: train.cells.length - 1 + 2 * APPROACH + 1,
  };
}

/** One low-poly part of the train, in the train's own frame: +x is the way it runs, its front at x = 0, +y up. A box's
 * size is its width (x), height and depth; a cylinder's its radius and width (wheels, along z); an ore heap's its
 * radius, flattened. */
export interface TrainPart {
  id: string;
  type: 'box' | 'wheel' | 'ore';
  size: readonly number[];
  position: readonly [number, number, number];
  color: number;
}

const wheels = (id: string, xs: number[]): TrainPart[] =>
  xs.flatMap((x, i) =>
    [-0.3, 0.3].map((z, k): TrainPart => ({ id: `${id}-wheel-${2 * i + k}`, type: 'wheel', size: [0.11, 0.06], position: [x, 0.11, z], color: IRON })),
  );

function wagon(n: number): TrainPart[] {
  const back = -(LOCO + GAP + n * (GAP + WAGON));
  const mid = back - WAGON / 2;
  const id = `wagon-${n}`;
  return [
    { id: `${id}-chassis`, type: 'box', size: [WAGON, 0.1, 0.6], position: [mid, 0.17, 0], color: IRON },
    { id: `${id}-hopper`, type: 'box', size: [WAGON - 0.08, 0.34, 0.56], position: [mid, 0.39, 0], color: RUST },
    { id: `${id}-ore`, type: 'ore', size: [0.3], position: [mid, 0.56, 0], color: ORE },
    ...wheels(id, [mid + 0.3, mid - 0.3]),
  ];
}

export const TRAIN_PARTS: readonly TrainPart[] = [
  { id: 'loco-chassis', type: 'box', size: [LOCO, 0.12, 0.62], position: [-LOCO / 2, 0.18, 0], color: IRON },
  { id: 'loco-hood', type: 'box', size: [0.8, 0.36, 0.5], position: [-0.42, 0.42, 0], color: PAINT },
  { id: 'loco-cab', type: 'box', size: [0.45, 0.56, 0.6], position: [-1.02, 0.52, 0], color: CAB },
  { id: 'loco-roof', type: 'box', size: [0.55, 0.06, 0.66], position: [-1.02, 0.83, 0], color: IRON },
  { id: 'loco-stack', type: 'box', size: [0.1, 0.2, 0.1], position: [-0.25, 0.7, 0], color: IRON },
  { id: 'loco-lamp', type: 'box', size: [0.04, 0.1, 0.16], position: [-0.02, 0.48, 0], color: LAMP },
  ...wheels('loco', [-0.2, -0.65, -1.1]),
  ...Array.from({ length: WAGONS }, (_, n) => wagon(n)).flat(),
];

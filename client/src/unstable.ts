// The Unstable Core (docs/specs/game-design.md section 7.13, #751): the 7 centre cells charge the marbles that stay on
// them, a charged marble weighs 1 + its charges in a push and 4 charges blow it off; the core collapses in P2 and a wedge
// shockwave shoves the busiest sixth of the board outward in P3. Pure helpers over the bridge's `charges()`,
// `unstable()` and `last_unstable()` records, the meshes live in main.ts.
import { DIRECTIONS, VANISHED, axialTo3D, cellIndex, isMarble, type Axial } from './board';
import { SLIDE_MS, type SlideTrack } from './slide';

/** The 7 energy cells: the centre and its 6 neighbours. */
export const ENERGY: readonly Axial[] = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** A marble with this many charges is one step from overload: its pips warn. */
export const WARN_CHARGES = 3;
/** The corners of the board in turn: wedge `i` lies between corner `i` and the next. */
const CORNERS: readonly Axial[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** How far a wedge slice reaches, in cells from the centre: past the rim. */
export const WEDGE_REACH = 4.7;
/** The burst where a marble overloads or falls with the core, and the sweep of the shockwave. */
export const BURST_MS = 450;
export const SWEEP_MS = 650;
/** Reduced motion: the burst and the sweep show whole and fade, no growth. */
export const FLASH_MS = 350;
/** The amber of the core and its pips, the Furnace's light, and the red of a pip about to overload. */
export const CORE_COLOR = 0xffb347;
export const WARN_COLOR = 0xff5a36;

export interface Charge {
  cell: Axial;
  n: number;
}

/** What the player reads before the next event. `wedge` and `shockIn` are `-1` when not announced. */
export interface Core {
  core: boolean; // the core still stands
  collapsing: boolean; // it collapses at the end of the player's next turn
  wedge: number; // the wedge the next shockwave hits
  shockIn: number; // player turns before it, -1 before P3
}

export interface Shove {
  from: Axial;
  to: Axial;
}

/** What the last ply's hook did: the board just before it, the marbles that overloaded, whether the core collapsed, the
 * wedge the shockwave hit (`-1` none) and each marble it shoved. */
export interface UnstableEvents {
  board: number[];
  overloaded: Axial[];
  collapsed: boolean;
  wedge: number;
  shoves: Shove[];
}

/** The charged marbles of `Encounter.charges()`, `[q, r, charges]` records. */
export function parseCharges(flat: ArrayLike<number>): Charge[] {
  const all = Array.from(flat);
  const out: Charge[] = [];
  for (let i = 0; i < all.length; i += 3) out.push({ cell: [all[i]!, all[i + 1]!], n: all[i + 2]! });
  return out;
}

/** The next events of `Encounter.unstable()`, `null` for the other bosses. */
export function parseCore(flat: ArrayLike<number>): Core | null {
  if (flat.length === 0) return null;
  return { core: flat[0] === 1, collapsing: flat[1] === 1, wedge: flat[2]!, shockIn: flat[3]! };
}

/** The events of `Encounter.last_unstable()`: `[overloads, collapsed, wedge, shoves]`, 61 board codes, the overloaded
 * cells, then the shoves as `[from_q, from_r, to_q, to_r]`. `null` when the last ply did nothing to show. */
export function parseEvents(flat: ArrayLike<number>): UnstableEvents | null {
  if (flat.length === 0) return null;
  const all = Array.from(flat);
  const [overloads, collapsed, wedge, shoves] = all;
  const cells = all.slice(65, 65 + 2 * overloads!);
  const moves = all.slice(65 + 2 * overloads!);
  return {
    board: all.slice(4, 65),
    overloaded: Array.from({ length: overloads! }, (_, i): Axial => [cells[2 * i]!, cells[2 * i + 1]!]),
    collapsed: collapsed === 1,
    wedge: wedge!,
    shoves: Array.from({ length: shoves! }, (_, i) => ({ from: [moves[4 * i]!, moves[4 * i + 1]!] as Axial, to: [moves[4 * i + 2]!, moves[4 * i + 3]!] as Axial })),
  };
}

const turns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** HUD line of the tell: the collapse, the glowing wedge, the turns to the next shockwave, or the rule while the core
 * stands. '' for the other bosses and for the P2 stretch with no event ahead. */
export function coreText(c: Core | null): string {
  if (!c) return '';
  if (c.collapsing) return 'The core collapses after your move';
  if (c.wedge >= 0) return 'Shockwave after your move: the glowing wedge';
  if (c.shockIn >= 0) return `Shockwave in ${turns(c.shockIn)}`;
  return c.core ? 'Charged marbles weigh more · 4 charges blow a marble off' : '';
}

/** The x offsets of `n` pips in a row over a marble, centred. */
export const pipOffsets = (n: number): number[] => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 0.2);

/** The slice of the board a wedge covers, as the apex and the two corners of a triangle on the board plane. */
export function wedgeCorners(wedge: number): [{ x: number; z: number }, { x: number; z: number }, { x: number; z: number }] {
  const [a, b] = [CORNERS[wedge]!, CORNERS[(wedge + 1) % 6]!];
  const [pa, pb] = [axialTo3D(a[0] * WEDGE_REACH, a[1] * WEDGE_REACH), axialTo3D(b[0] * WEDGE_REACH, b[1] * WEDGE_REACH)];
  return [{ x: 0, z: 0 }, { x: pa.x, z: pa.z }, { x: pb.x, z: pb.z }];
}

/** The direction code of the step from `from` to `to`. */
export const shoveDir = ({ from, to }: Shove): number => DIRECTIONS.findIndex(([dq, dr]) => dq === to[0] - from[0] && dr === to[1] - from[1]);

const onBoard = (board: ArrayLike<number>, [q, r]: Axial): boolean => (board[cellIndex(q, r)] ?? VANISHED) !== VANISHED;

/** One slide per marble the shockwave shoved onto the board; a shove past the rim is a fall. */
export function shoveTracks(events: UnstableEvents, reduced: boolean): (SlideTrack & { dir: number })[] {
  return events.shoves
    .filter(({ to }) => onBoard(events.board, to))
    .map((shove) => {
      const [a, b] = [axialTo3D(...shove.from), axialTo3D(...shove.to)];
      return { cell: shove.to, from: { x: a.x, z: a.z }, to: { x: b.x, z: b.z }, durationMs: reduced ? 0 : SLIDE_MS, dir: shoveDir(shove) };
    });
}

/** The marbles the shockwave threw off the board, with their side and the direction they fall. */
export function fallen(events: UnstableEvents): { cell: Axial; side: number; dir: number }[] {
  return events.shoves
    .filter(({ to }) => !onBoard(events.board, to))
    .map((s) => ({ cell: s.from, side: events.board[cellIndex(...s.from)]!, dir: shoveDir(s) }));
}

/** The cells where a marble overloaded or fell with the core: a burst on each. */
export function lostCells(events: UnstableEvents): Axial[] {
  const fell = events.collapsed ? ENERGY.filter((c) => isMarble(events.board[cellIndex(...c)])) : [];
  return [...events.overloaded, ...fell.filter(([q, r]) => !events.overloaded.some(([oq, or]) => oq === q && or === r))];
}

/** The burst ring `elapsedMs` into its effect: its radius (cells) and opacity, and whether it is over. */
export function burstAt(elapsedMs: number, reduced: boolean): { radius: number; opacity: number; done: boolean } {
  const t = Math.min(1, Math.max(0, elapsedMs) / (reduced ? FLASH_MS : BURST_MS));
  return { radius: reduced ? 0.7 : 0.25 + 0.6 * t, opacity: 0.9 * (1 - t), done: t >= 1 };
}

/** The shockwave's wedge slice `elapsedMs` into the pulse: its scale about the centre and opacity, and whether it is
 * over. Reduced motion: the whole slice from the start, fading. */
export function sweepAt(elapsedMs: number, reduced: boolean): { scale: number; opacity: number; done: boolean } {
  const t = Math.min(1, Math.max(0, elapsedMs) / (reduced ? FLASH_MS : SWEEP_MS));
  return { scale: reduced ? 1 : Math.max(0.02, 1 - (1 - t) ** 2), opacity: 0.8 * (1 - t), done: t >= 1 };
}

/** The glow of the energy cells at `seconds`: a slow pulse, steady under reduced motion; it flickers once the core
 * collapses next turn. */
export function energyGlow(seconds: number, collapsing: boolean, reduced: boolean): number {
  if (reduced) return collapsing ? 0.25 : 0.5;
  if (collapsing) return Math.floor(seconds * 8) % 2 === 0 ? 0.65 : 0.1;
  return 0.35 + 0.2 * Math.sin(seconds * 2.4);
}

/** The glow of an announced wedge: steady under reduced motion, a slow pulse otherwise. */
export const wedgeGlow = (seconds: number, reduced: boolean): number => (reduced ? 0.35 : 0.3 + 0.12 * Math.sin(seconds * 4));

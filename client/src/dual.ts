// The Dual Room (#796, #947, game-design.md section 7.15): two radius 4 rooms side by side, the south one on the rows
// r >= 0 and the north one on r <= -1, a lit wall between them that sinks into the floor at the 5th ejection, the mark
// of an announced return and the returning marble dropping onto its cell. Pure helpers over the bridge's records.
import { cellsFor, type Axial } from './board';

/** The centres of the two rooms, south then north (crates/abalone-core encounter/dual.rs). */
export const ROOMS: readonly Axial[] = [
  [-2, 4],
  [3, -5],
];

const distance = (a: Axial, b: Axial): number =>
  (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

/** The room of a cell: `0` south, `1` north. */
export const roomOf = ([, r]: Axial): number => (r < 0 ? 1 : 0);

/** The 122 cells of the two rooms. */
export const DUAL_CELLS: readonly Axial[] = cellsFor(9).filter((c) => ROOMS.some((centre) => distance(c, centre) <= 4));

/** The fight opens looking along the wall, from the east: the two rooms side by side. */
export const DUAL_AZIMUTH = Math.PI / 2;
/** Low enough that the camera stays under the bay's gantry ribs (y 12.8 and up, one right over the wall) once drawn back
 * to fit both rooms. */
export const DUAL_POLAR = 0.9;

/** The wall: a lit bar on the board plane between the two wall rows, `x` its middle, `length` across both rows. */
export const WALL = { x: 0.25, z: -Math.sqrt(3) / 4, length: 5.5, height: 0.6, depth: 0.1 };

/** The returning marble falls from this height (cell spacings) onto its cell in DROP_MS. */
export const DROP_HEIGHT = 3;
export const DROP_MS = 450;
/** The wall sinks into the floor and fades in COLLAPSE_MS. */
export const COLLAPSE_MS = 900;

export interface DualState {
  collapsed: boolean;
  coming: { side: number; cell: Axial } | null;
}

/** `Encounter.dual()`: `[collapsed, side, q, r]`, null for the other bosses. */
export function parseDual(flat: ArrayLike<number>): DualState | null {
  if (flat.length === 0) return null;
  const [collapsed, side, q, r] = Array.from(flat) as [number, number, number, number];
  return { collapsed: collapsed === 1, coming: side === 0 ? null : { side, cell: [q, r] } };
}

/** `Encounter.last_return()`: `[side, q, r]` of the marble that landed at the end of the last ply, null when none. */
export function parseReturn(flat: ArrayLike<number>): { side: number; cell: Axial } | null {
  if (flat.length === 0) return null;
  const [side, q, r] = Array.from(flat) as [number, number, number];
  return { side, cell: [q, r] };
}

/** The HUD line: whose marble comes back on the mark, and the wall. */
export function dualText(state: DualState | null, player: number): string {
  if (!state) return '';
  const coming = state.coming && `${state.coming.side === player ? 'Your' : 'Its'} marble comes back on the mark next turn`;
  if (state.collapsed) return coming ? `${coming} · the wall is down, ejected marbles are gone` : 'The wall is down, ejected marbles are gone';
  return `${coming ?? 'Ejected marbles come back in the other room'} · the wall falls at 5`;
}

/** The returning marble `elapsedMs` into its fall: its height over its cell, faster and faster. Reduced motion: no fall. */
export function dropAt(elapsedMs: number, reduced: boolean): { y: number; done: boolean } {
  const t = reduced ? 1 : Math.min(1, Math.max(0, elapsedMs / DROP_MS));
  return { y: DROP_HEIGHT * (1 - t * t), done: t === 1 };
}

/** The wall `elapsedMs` into its collapse: sunk by `y`, at `opacity`. Reduced motion: gone at once. */
export function wallAt(elapsedMs: number, reduced: boolean): { y: number; opacity: number; done: boolean } {
  const t = reduced ? 1 : Math.min(1, elapsedMs / COLLAPSE_MS);
  return { y: t === 0 ? 0 : -WALL.height * t, opacity: 1 - t, done: t === 1 };
}

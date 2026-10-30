// The Dual Room (#796, #947, #955, game-design.md section 7.15): two radius 3 rooms, the south one on the rows r >= 1
// and the north one on r <= -1, the void on the row r = 0 between them, holes in the plate that the bridge's 5 cells
// fill at the 5th ejection, coming down into place; the mark of an announced return and the returning marble dropping
// onto its cell. Pure helpers over the bridge's records.
import { cellsFor, type Axial } from './board';

/** The centres of the two rooms, south then north (crates/abalone-core encounter/dual.rs). */
export const ROOMS: readonly Axial[] = [
  [-2, 4],
  [2, -4],
];

const distance = (a: Axial, b: Axial): number =>
  (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

/** The room of a cell: `0` south, `1` north. */
export const roomOf = ([, r]: Axial): number => (r < 0 ? 1 : 0);

/** The 74 cells of the two rooms. */
export const DUAL_CELLS: readonly Axial[] = cellsFor(7).filter((c) => ROOMS.some((centre) => distance(c, centre) <= 3));

/** The void's 5 cells, the row between the two facing edges: the bridge from the 5th ejection. */
export const BRIDGE: readonly Axial[] = [-2, -1, 0, 1, 2].map((q): Axial => [q, 0]);

/** The fight opens looking along the void, from the east: the two rooms side by side. */
export const DUAL_AZIMUTH = Math.PI / 2;
/** Tilted enough to read both rooms once drawn back to fit them. */
export const DUAL_POLAR = 0.9;

/** The returning marble falls from this height (cell spacings) onto its cell in DROP_MS. */
export const DROP_HEIGHT = 3;
export const DROP_MS = 450;
/** The bridge's cells come down from this height into the void in BRIDGE_MS, once the push's slide is over: longer than
 * the splash of the ejection that brings them (blood.ts), so the bridge reads on its own. */
export const BRIDGE_HEIGHT = 1.5;
export const BRIDGE_MS = 1200;

export interface DualState {
  bridged: boolean;
  coming: { side: number; cell: Axial } | null;
}

/** `Encounter.dual()`: `[bridged, side, q, r]`, null for the other bosses. */
export function parseDual(flat: ArrayLike<number>): DualState | null {
  if (flat.length === 0) return null;
  const [bridged, side, q, r] = Array.from(flat) as [number, number, number, number];
  return { bridged: bridged === 1, coming: side === 0 ? null : { side, cell: [q, r] } };
}

/** `Encounter.last_return()`: `[side, q, r]` of the marble that landed at the end of the last ply, null when none. */
export function parseReturn(flat: ArrayLike<number>): { side: number; cell: Axial } | null {
  if (flat.length === 0) return null;
  const [side, q, r] = Array.from(flat) as [number, number, number];
  return { side, cell: [q, r] };
}

/** The HUD line: whose marble comes back on the mark, and the bridge. */
export function dualText(state: DualState | null, player: number): string {
  if (!state) return '';
  const coming = state.coming && `${state.coming.side === player ? 'Your' : 'Its'} marble comes back on the mark next turn`;
  if (state.bridged) return coming ? `${coming} · the bridge is up, ejected marbles are gone` : 'The bridge is up, ejected marbles are gone';
  return `${coming ?? 'Ejected marbles come back in the other room'} · the bridge comes at 5`;
}

/** The returning marble `elapsedMs` into its fall: its height over its cell, faster and faster. Reduced motion: no fall. */
export function dropAt(elapsedMs: number, reduced: boolean): { y: number; done: boolean } {
  const t = reduced ? 1 : Math.min(1, Math.max(0, elapsedMs / DROP_MS));
  return { y: DROP_HEIGHT * (1 - t * t), done: t === 1 };
}

/** The bridge's cells `elapsedMs` into their descent: their height over their place, slower and slower, up high before it
 * starts. Reduced motion: in place at once. */
export function bridgeAt(elapsedMs: number, reduced: boolean): { y: number; done: boolean } {
  const t = reduced ? 1 : Math.min(1, Math.max(0, elapsedMs / BRIDGE_MS));
  return { y: BRIDGE_HEIGHT * (1 - t) * (1 - t), done: t === 1 };
}

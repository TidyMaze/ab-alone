// The goal of the Open world on arrival (#1530, docs/specs/openworld.md section 14): one sentence of objective and a text bearing to the
// nearest tower not beaten, in the HUD. Pure functions: the mode writes the lines. The bearing is the minimap's own: the ground turned by the
// camera (`screenOffset`), so "up" is up on screen, and the arrows of the minimap point the same way. Tally's flat register, and no word of a
// later stage of the story (world.md section 12.2).
import type { Axial } from './board';
import { screenOffset } from './openworldminimap';

/** Tally's line about a claim, one sentence after the first-visit line that names it (#1171): the line says nothing to a player who has not met the word. */
export const CLAIM_NOTE = "A claim is a case on Tally's ledger. Unworked means no tower is beaten.";

/** The eight ways on the screen, from straight up and clockwise. */
export const WAYS = ['straight up', 'to the upper right', 'to the right', 'to the lower right', 'straight down', 'to the lower left', 'to the left', 'to the upper left'] as const;

/** The distance in cells (the hex distance) and the way on screen from `hero` to `cell`, with the camera at `yaw`. */
export function bearingOf(hero: Axial, cell: Axial, yaw: number): { cells: number; way: string } {
  const [dq, dr] = [cell[0] - hero[0], cell[1] - hero[1]];
  const { x, y } = screenOffset(hero, cell, yaw);
  const sector = Math.round(Math.atan2(x, -y) / (Math.PI / 4)); // from straight up, clockwise, in eighths of a turn
  return { cells: (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2, way: WAYS[(sector + 8) % 8]! };
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

export interface GoalState {
  hero: Axial;
  yaw: number;
  /** `guided` false (#1532): a tower of a farther ring than the one to beat, which the bearing does not point at. */
  lairs: readonly { cell: Axial; beaten: boolean; guided?: boolean }[];
  /** The lore logs not found yet. */
  logsLeft: number;
}

/** The two lines of the HUD: the objective, and the bearing to the nearest tower not beaten, or, once every tower is beaten, what is left. Both empty
 * for a world with no tower. */
export function goalLines({ hero, yaw, lairs, logsLeft }: GoalState): { goal: string; bearing: string } {
  if (lairs.length === 0) return { goal: '', bearing: '' };
  const near = lairs
    .filter(({ beaten, guided }) => !beaten && guided !== false)
    .map(({ cell }) => bearingOf(hero, cell, yaw))
    .sort((a, b) => a.cells - b.cells)[0];
  if (!near) return { goal: `Goal done: all ${lairs.length} towers are beaten.`, bearing: logsLeft > 0 ? `Left: ${plural(logsLeft, 'lore log')} to find.` : 'Left: the dungeon gates.' };
  return { goal: `Goal: beat the ${plural(lairs.length, 'tower')} of Hollow. One medal each.`, bearing: `Nearest tower: ${plural(near.cells, 'cell')}, ${near.way}.` };
}

/** The cell of the tower the goal names (#1534): the nearest one not beaten that guidance points at, the one the camera frames. `null` once
 * every tower is beaten, or for a world with no tower. */
export function goalCell({ hero, yaw, lairs }: Omit<GoalState, 'logsLeft'>): Axial | null {
  const near = lairs
    .filter(({ beaten, guided }) => !beaten && guided !== false)
    .map(({ cell }) => ({ cell, cells: bearingOf(hero, cell, yaw).cells }))
    .sort((a, b) => a.cells - b.cells)[0];
  return near ? near.cell : null;
}

/** A tower as the contract reads it: its cell, whether it is beaten, whether guidance points at it (the ring to beat), its boss and its ring. */
export interface ContractTower {
  cell: Axial;
  beaten: boolean;
  guided?: boolean;
  name: string;
  ring: number;
}

/** The posted contract of a town (#1618, section 18): the nearest tower of the ring to beat, by its boss, its ring, its cells and its way from the
 * town. Once every tower is beaten, it says so. Empty for a world with no tower. */
export function contractLine({ hero, yaw, lairs }: { hero: Axial; yaw: number; lairs: readonly ContractTower[] }): string {
  if (lairs.length === 0) return '';
  const near = lairs
    .filter(({ beaten, guided }) => !beaten && guided !== false)
    .map((tower) => ({ ...tower, ...bearingOf(hero, tower.cell, yaw) }))
    .sort((a, b) => a.cells - b.cells)[0];
  const n = lairs.length;
  if (!near) return `No contract: all ${n} ${n === 1 ? 'tower is' : 'towers are'} beaten.`;
  return `Contract: ${near.name}, ring ${near.ring}, ${plural(near.cells, 'cell')}, ${near.way}.`;
}

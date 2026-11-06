// The recruits of the Open world (#1531, docs/specs/openworld.md section 16): a marble a push of the troop sends into the water or off the edge
// of the world joins the troop, up to a cap. This holds the rule alone and imports nothing that loads the engine, so the MCP server
// (mcp/src/world.ts) uses it too.
import type { Axial } from './board';
import { arrival } from './openworldteleport';

/** The most recruits a world's troop holds, on top of its 15 marbles. */
export const RECRUIT_MAX = 5;

/** The cell a recruit appears on: the free cell nearest the hero within three cells, never the hero's own nor a cell of the troop; `null` when
 * the cap is reached (`recruits` is the number already in the troop) or no cell round the hero is free. */
export function recruitCell(at: Axial, troop: readonly Axial[], recruits: number, free: (cell: Axial) => boolean): Axial | null {
  if (recruits >= RECRUIT_MAX) return null;
  const held = new Set(troop.map(([q, r]) => `${q},${r}`));
  return arrival(at, 1, (cell) => free(cell) && !held.has(`${cell[0]},${cell[1]}`))[0] ?? null;
}

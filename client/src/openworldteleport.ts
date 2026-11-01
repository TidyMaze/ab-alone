// The rules of the Open world's teleporters (#1412, docs/specs/openworld.md section 10): the hero on a teleporter travels to another
// one already discovered, the troop on the free cells round it. The teleporters come from the seed (the bridge's `world_teleporters`);
// this holds the rules alone and imports nothing that loads the engine, so the MCP server (mcp/src/world.ts) uses it too.
import type { Axial } from './board';

/** The troop finds its cells within this many cells of the teleporter it arrives on. */
const ARRIVAL = 3;
/** A press on the map picks the teleporter within this many cells of the cell under it. */
const PICK = 2;

const same = (a: Axial, b: Axial): boolean => a[0] === b[0] && a[1] === b[1];
const hex = (a: Axial, b: Axial): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] - b[0] + a[1] - b[1])) / 2;
const text = ([q, r]: Axial): string => `(${q},${r})`;

/** The `q, r` pairs of a flat list, as the bridge gives the teleporters. */
export const pairs = (flat: ArrayLike<number>): Axial[] => Array.from({ length: flat.length / 2 }, (_, i): Axial => [flat[2 * i]!, flat[2 * i + 1]!]);

/** The end of a teleport: the hero's cell and the troop's, or why it is refused, in words. */
export type Teleport = { hero: Axial; troop: Axial[] } | { refused: string };

/** The cells round `at`, within ARRIVAL, that `free` lets a marble stand on, the nearest first, at most `size` of them. */
export function arrival(at: Axial, size: number, free: (cell: Axial) => boolean): Axial[] {
  const cells: Axial[] = [];
  for (let dq = -ARRIVAL; dq <= ARRIVAL; dq++) {
    for (let dr = Math.max(-ARRIVAL, -dq - ARRIVAL); dr <= Math.min(ARRIVAL, -dq + ARRIVAL); dr++) {
      const cell: Axial = [at[0] + dq, at[1] + dr];
      if (!same(cell, at) && free(cell)) cells.push(cell);
    }
  }
  return cells.sort((a, b) => hex(a, at) - hex(b, at)).slice(0, size);
}

/** The teleport of the hero on `at` to the teleporter on `to`, with a troop of `size`: `teleporters` are the world's, `seen` tells a
 * discovered cell, `free` a cell a marble can stand on now (open ground, no enemy, no lair). The hero must stand on a teleporter, and
 * `to` must be another one, discovered, with no enemy on it and room round it for the whole troop. */
export function teleport(teleporters: readonly Axial[], seen: (q: number, r: number) => boolean, at: Axial, to: Axial, size: number, free: (cell: Axial) => boolean): Teleport {
  const on = (cell: Axial): boolean => teleporters.some((t) => same(t, cell));
  if (!on(at)) return { refused: 'the hero stands on no teleporter' };
  if (!on(to)) return { refused: `no teleporter on ${text(to)}` };
  if (same(at, to)) return { refused: 'the hero stands on that teleporter' };
  if (!seen(to[0], to[1])) return { refused: `the teleporter on ${text(to)} is not discovered yet` };
  if (!free(to)) return { refused: `an enemy stands on the teleporter on ${text(to)}` };
  const troop = arrival(to, size, free);
  if (troop.length < size) return { refused: `no room for the troop round the teleporter on ${text(to)}` };
  return { hero: to, troop };
}

/** The teleporter of `teleporters` nearest `cell`, within PICK cells of it, `null` when none is: what a press on the map picks. */
export function teleporterNear(teleporters: readonly Axial[], cell: Axial): Axial | null {
  const near = teleporters.filter((t) => hex(t, cell) <= PICK).sort((a, b) => hex(a, cell) - hex(b, cell));
  return near[0] ?? null;
}

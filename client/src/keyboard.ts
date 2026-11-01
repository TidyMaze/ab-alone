// Pure logic of the keyboard play (#738): Tab cycles the legal groups, Q W E A S D pick the direction. No DOM.
import { type Axial, type Move } from './board';

/** Key to direction code (E, W, NE, SW, NW, SE), laid out like the hexagon: Q NW, W NE, A W, E E, S SW, D SE. */
export const KEY_DIRS: Readonly<Record<string, number>> = { q: 4, w: 2, e: 0, a: 1, s: 3, d: 5 };
const DIR_NAMES = ['east', 'west', 'north-east', 'south-west', 'north-west', 'south-east'];

const inOrder = (cells: readonly Axial[]): Axial[] => [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const keyOf = (cells: readonly Axial[]): string => JSON.stringify(inOrder(cells));

/** Every group that has a legal move, once, in the order of the engine, its cells in board order. */
export function legalGroups(moves: readonly Move[]): Axial[][] {
  const seen = new Map<string, Axial[]>();
  for (const mv of moves) if (!seen.has(keyOf(mv.cells))) seen.set(keyOf(mv.cells), inOrder(mv.cells));
  return [...seen.values()];
}

/** The group `step` (1 Tab, -1 Shift+Tab) after the selection, or null past either end so focus can leave. A
 * selection that is not a legal group counts as none. */
export function nextGroup(moves: readonly Move[], selection: readonly Axial[], step: 1 | -1): Axial[] | null {
  const groups = legalGroups(moves);
  const at = groups.findIndex((g) => keyOf(g) === keyOf(selection));
  const from = at < 0 ? (step > 0 ? -1 : groups.length) : at;
  return groups[from + step] ?? null;
}

/** The legal move of exactly the selected group in this direction, or null. */
export function moveFor(moves: readonly Move[], selection: readonly Axial[], dir: number): Move | null {
  return moves.find((mv) => mv.dir === dir && keyOf(mv.cells) === keyOf(selection)) ?? null;
}

/** What the aria-live HUD says after a key: the group, then the direction (-1 for none). With a gamepad in use (`pad`,
 * #1252) the hints name its buttons. */
export function announce(moves: readonly Move[], selection: readonly Axial[], dir: number, pad = false): string {
  const groups = legalGroups(moves);
  const at = groups.findIndex((g) => keyOf(g) === keyOf(selection));
  if (at < 0) return pad ? 'no group selected, RB for a group' : 'no group selected';
  const n = selection.length;
  const group = `group ${at + 1} of ${groups.length}, ${n} marble${n > 1 ? 's' : ''}`;
  if (dir < 0) return pad ? `${group}, stick to aim, LB RB to switch` : group;
  if (!moveFor(moves, selection, dir)) return `${group}, no move ${DIR_NAMES[dir]}`;
  return `${group}, ${DIR_NAMES[dir]}, ${pad ? 'A to play, B to back out' : 'Enter to play'}`;
}

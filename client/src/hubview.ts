// The hub on screen (docs/specs/game-design.md section 3.5, #521): the board main.ts draws the map with, the cell an
// arrow key rolls the marble to, and the HUD plate. Pure: no DOM, no three.js.
import { CELLS, VANISHED, type Axial } from './board';
import { canEnter, HUB_CELLS, neighbours, roomAt, type Door, type Spot } from './hub';

/** The bridge board with a hole on every cell off the hub map: the frame shrinks to the map, the other discs hide. */
export const HUB_BOARD: readonly number[] = CELLS.map(([q, r]) =>
  HUB_CELLS.some(([hq, hr]) => hq === q && hr === r) ? 0 : VANISHED,
);

// Left and right roll along the row. The rows are offset, so up and down zigzag to keep the column: up-right from an
// even row, up-left from an odd one, and down goes back the same way.
const ARROWS: Record<string, (odd: boolean) => Axial> = {
  ArrowLeft: () => [-1, 0],
  ArrowRight: () => [1, 0],
  ArrowUp: (odd) => (odd ? [0, -1] : [1, -1]),
  ArrowDown: (odd) => (odd ? [-1, 1] : [0, 1]),
};

/** The neighbour an arrow key rolls the marble to, maybe off the map (hub.ts step keeps it put then); `null` for any
 * other key. */
export function arrowCell([q, r]: Axial, key: string): Axial | null {
  const dir = ARROWS[key]?.(r % 2 !== 0);
  return dir ? [q + dir[0], r + dir[1]] : null;
}

const title = (deck: string): string => deck[0]!.toUpperCase() + deck.slice(1);
const DOORS: Record<Exclude<Door['kind'], 'lift'>, string> = {
  boss: 'Boss door',
  terminal: 'Terminal',
  hotseat: 'Hot-seat table',
  bot: 'Bot table',
  online: 'Online table',
  royale: 'Battle royale lobby',
};

/** The HUD plate in the hub: the deck, the room the marble stands on, and Tally's line when there is one. */
export function hubHtml({ deck, cell }: Spot, tally = ''): string {
  const door = roomAt(deck, cell);
  const room = !door ? '' : door.kind === 'lift' ? `Lift to ${title(door.to)}` : DOORS[door.kind];
  const line = tally ? `<div class="tally">${tally}</div>` : '';
  return `<div class="turn"><span>Ship · ${title(deck)}</span></div><small>${room}</small>${line}`;
}

/** Tally's line when a roll to `to` bumps a locked lift next to the marble (#523), else ''. */
export function bumpLine(at: Spot, to: Axial, beaten: readonly string[]): string {
  const door = roomAt(at.deck, to);
  const next = neighbours(at.cell).some(([q, r]) => q === to[0] && r === to[1]);
  if (door?.kind !== 'lift' || !next || canEnter(door, beaten)) return '';
  return `Lift to ${title(door.to)}: locked. This deck's boss is still on the books.`;
}

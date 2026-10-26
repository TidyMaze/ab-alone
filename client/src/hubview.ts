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

const BOSS_NAMES: Record<string, string> = {
  echo: 'The Echo',
  hull: 'The Hull',
  choir: 'The Choir',
  chaplain: 'The Chaplain',
  ballast: 'The Ballast Mind',
};

export function bossTitle(boss: string): string {
  return BOSS_NAMES[boss] ?? 'Boss';
}

const DESCRIPTORS: Record<Exclude<Door['kind'], 'lift' | 'boss'>, string> = {
  bot: 'Practice match against AI',
  hotseat: '2 players, one screen',
  online: 'Peer-to-peer 1v1 match',
  royale: 'Multi-player battle royale',
  terminal: 'Ship archive and audio log',
};

/** Reachability hint for a hovered hub cell relative to the marble's position (#628). */
export function reachabilityText(from: Axial, target: Axial): string {
  if (from[0] === target[0] && from[1] === target[1]) return 'Current position';
  const isNeighbour = neighbours(from).some(([q, r]) => q === target[0] && r === target[1]);
  return isNeighbour ? 'Click to move' : 'Out of reach (roll closer)';
}

/** Name, purpose subtitle and reachability affordance of any hub cell hovered by the player (#628). */
export function hubTargetText(at: Spot, hovered: Axial): { name: string; desc: string; reach: string } {
  const door = roomAt(at.deck, hovered);
  const name = !door
    ? 'Deck floor'
    : door.kind === 'lift'
      ? `Lift to ${title(door.to)}`
      : DOORS[door.kind];
  const desc = !door
    ? 'Open transit corridor'
    : door.kind === 'boss'
      ? `${bossTitle(door.boss)} (${title(at.deck)} boss)`
      : door.kind === 'lift'
        ? `Transit to ${title(door.to)}`
        : DESCRIPTORS[door.kind];
  const reach = reachabilityText(at.cell, hovered);
  return { name, desc, reach };
}

/** The HUD plate in the hub: the deck, the room the marble stands on, Tally's line, and target inspection (#628). */
export function hubHtml({ deck, cell }: Spot, tally = '', hover: Axial | null = null): string {
  const door = roomAt(deck, cell);
  const room = !door ? '' : door.kind === 'lift' ? `Lift to ${title(door.to)}` : DOORS[door.kind];
  const line = tally ? `<div class="tally">${tally}</div>` : '';
  const preview = hover
    ? (() => {
        const { name, desc, reach } = hubTargetText({ deck, cell }, hover);
        return `<div class="hub-preview">Target: ${name} · ${desc} <span class="affordance">(${reach})</span></div>`;
      })()
    : '';
  return `<div class="turn"><span>Ship · ${title(deck)}</span></div><small>${room}</small>${line}${preview}`;
}

/** Tally's line when a roll to `to` bumps a locked lift next to the marble (#523), else ''. */
export function bumpLine(at: Spot, to: Axial, beaten: readonly string[]): string {
  const door = roomAt(at.deck, to);
  const next = neighbours(at.cell).some(([q, r]) => q === to[0] && r === to[1]);
  if (door?.kind !== 'lift' || !next || canEnter(door, beaten)) return '';
  return `Lift to ${title(door.to)}: locked. This deck's boss is still on the books.`;
}

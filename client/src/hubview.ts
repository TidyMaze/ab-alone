// The hub on screen (docs/specs/game-design.md section 3.5, #521): the board main.ts draws the map with, the cell an
// arrow key rolls the marble to, and the HUD plate. Pure: no DOM, no three.js.
import { CELLS, VANISHED, type Axial } from './board';
import { DECK_NAMES, type Deck } from './deck';
import { medalLabel } from './medals';
import { isTouch } from './touchwording';
import { canEnter, HUB_CELLS, neighbours, roomAt, roomsOf, type Door, type Spot } from './hub';

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
  medals: 'Medal room',
  daily: 'Daily challenge',
  run: 'Rogue-lite run',
  together: 'Fight together',
  ranked: 'Ranked',
  world: 'Open world',
  trainer: 'Trainer',
};

const BOSS_NAMES: Record<string, string> = {
  echo: 'The Echo',
  hull: 'The Hull',
  choir: 'The Choir',
  chaplain: 'The Chaplain',
  ballast: 'The Ballast Mind',
  alien: 'The Alien',
  railyard: 'The Rail Yard',
  magnetizer: 'The Magnetizer',
  pulsar: 'The Pulsar',
  overseer: 'The Overseer',
  assembly: 'The Assembly Line',
  core: 'The Unstable Core',
  dual: 'The Dual Room',
  stalker: 'The Stalker',
  swarm: 'The Swarm',
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
  medals: 'Every boss, its medal and best turns',
  daily: 'One boss and one seed a day',
  run: 'Three acts, one army of 14',
  together: 'Two players, one army, a boss',
  ranked: 'Online 1v1, Elo and tiers',
  world: 'A generated hex world',
  trainer: 'Waves against the bot, one more each',
};

/** Reachability hint for a hovered hub cell relative to the marble's position (#628). */
export function reachabilityText(from: Axial, target: Axial): string {
  if (from[0] === target[0] && from[1] === target[1]) return 'Current position';
  const isNeighbour = neighbours(from).some(([q, r]) => q === target[0] && r === target[1]);
  return isNeighbour ? (isTouch() ? 'Tap to move' : 'Click to move') : 'Out of reach (roll closer)';
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

// The deck plan (#1249): every room wears a label plate, always shown: its name and a short state, or a short label alone
// on a phone. A lift-shaft rail lists the five decks and the boss pips count the bosses beaten.
export interface RoomLabel {
  name: string;
  state: string;
  short: string;
  mark: '' | 'locked' | 'beaten';
}

const LABELS: Record<Exclude<Door['kind'], 'lift' | 'boss'>, [name: string, state: string, short: string]> = {
  hotseat: ['Hot-seat', '2 players', 'Hot-seat'],
  bot: ['Bot table', 'vs the ship AI', 'Bot'],
  online: ['Online', '1v1 peer room', 'Online'],
  royale: ['Royale', 'battle royale', 'Royale'],
  terminal: ['Terminal', 'lore entry', 'Terminal'],
  medals: ['Medal room', 'best turns', 'Medals'],
  daily: ['Daily', 'boss of the day', 'Daily'],
  run: ['Rogue-lite', '3-act run', 'Run'],
  together: ['Together', 'co-op vs a boss', 'Co-op'],
  ranked: ['Ranked', 'Elo ladder', 'Ranked'],
  world: ['Open world', 'walk Hollow', 'World'],
  trainer: ['Trainer', 'bot waves', 'Trainer'],
};

/** The plate of a room of `deck`: a lift points up or down to its deck, a boss door names its boss, and once it is
 * beaten its medal's best turns (`medals`, boss id -> turns, medals.ts). A phone shows the boss's name without "The". */
export function roomLabel(deck: Deck, door: Door, beaten: readonly string[], medals: Readonly<Record<string, number>> = {}): RoomLabel {
  if (door.kind === 'boss') {
    const boss = bossTitle(door.boss);
    const won = beaten.includes(door.boss);
    const turns = medals[door.boss];
    const medal = turns === undefined ? 'beaten' : medalLabel(turns);
    return { name: 'Boss door', state: won ? `${boss} · ${medal}` : boss, short: boss.replace(/^The /, ''), mark: won ? 'beaten' : '' };
  }
  if (door.kind === 'lift') {
    const open = canEnter(door, beaten);
    const arrow = DECK_NAMES.indexOf(door.to) > DECK_NAMES.indexOf(deck) ? '▲' : '▼';
    const to = title(door.to);
    return { name: `Lift ${arrow} ${to}`, state: open ? 'open' : 'locked', short: `${arrow} ${open ? to : 'Locked'}`, mark: open ? '' : 'locked' };
  }
  const [name, state, short] = LABELS[door.kind];
  return { name, state, short, mark: '' };
}

/** The plates of the deck, one per room on its cell, and YOU on the marble's floor cell; on a room its plate is marked. */
export function labelsHtml({ deck, cell: [mq, mr] }: Spot, beaten: readonly string[], medals: Readonly<Record<string, number>> = {}): string {
  const plates = roomsOf(deck).map(({ cell: [q, r], door }) => {
    const { name, state, short, mark } = roomLabel(deck, door, beaten, medals);
    const attrs = `${mark ? ` data-mark="${mark}"` : ''}${q === mq && r === mr ? ' data-here' : ''}`;
    return `<div class="hub-label" data-cell="${q},${r}" data-kind="${door.kind}"${attrs}><b>${name}</b><small>${state}</small><span class="short">${short}</span></div>`;
  });
  if (!roomAt(deck, [mq, mr])) plates.push(`<div class="hub-label you" data-cell="${mq},${mr}">You</div>`);
  return plates.join('');
}

const bossOf = (deck: Deck): string => roomsOf(deck).flatMap(({ door }) => (door.kind === 'boss' ? [door.boss] : []))[0]!;
/** A deck by its boss: beaten (from the boss menu too), else open once its lift is, else locked. */
const deckState = (deck: Deck, beaten: readonly string[]): 'beaten' | 'open' | 'locked' =>
  beaten.includes(bossOf(deck)) ? 'beaten' : canEnter({ kind: 'lift', to: deck }, beaten) ? 'open' : 'locked';

/** The lift-shaft rail: the five decks from the Bridge down, each with its state, and where the marble is. */
export function railHtml(at: Deck, beaten: readonly string[]): string {
  const rows = DECK_NAMES.map((deck, i) => {
    const state = deckState(deck, beaten);
    const boss = bossTitle(bossOf(deck));
    const line = state === 'locked' ? 'Lift locked' : `${boss} ${state === 'beaten' ? 'beaten' : 'waits'}`;
    const here = deck === at;
    return `<li data-deck="${deck}" data-state="${state}"${here ? ' aria-current="location"' : ''}><span class="n">0${i + 1}</span><b>${title(deck)}</b><small>${line}${here ? ' · you are here' : ''}</small></li>`;
  });
  return `<h2>Lift shaft</h2><ul>${rows.reverse().join('')}</ul>`;
}

/** The boss pips: the count of bosses beaten, then a pip per deck boss in deck order. */
export function pipsHtml(beaten: readonly string[]): string {
  const states = DECK_NAMES.map((deck) => [bossTitle(bossOf(deck)), deckState(deck, beaten)] as const);
  const count = states.filter(([, state]) => state === 'beaten').length;
  const pips = states.map(([boss, state]) => `<span class="pip" data-state="${state}" title="${boss}: ${state}"></span>`);
  return `<span class="count">Bosses ${count}/5</span>${pips.join('')}`;
}

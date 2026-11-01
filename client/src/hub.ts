// The hub (docs/specs/game-design.md section 3.5): one small hex map per deck, walked one cell at a time by the
// player's glass marble. Rooms are cells with a prop on the two outer rings, the same layout on every deck. Pure data
// and rules: no DOM, no three.js.
import { cellsFor, DIRECTIONS, type Axial } from './board';
import { DECK_NAMES, type Deck } from './deck';

export type Door =
  | { kind: 'boss'; boss: string }
  | { kind: 'hotseat' | 'bot' | 'online' | 'royale' }
  | { kind: 'daily' | 'run' | 'together' | 'ranked' | 'world' | 'trainer' } // a mode with no table (#1249)
  | { kind: 'terminal'; lore: string }
  | { kind: 'medals' } // the Medal room of the Mess (#812)
  | { kind: 'lift'; to: Deck };

export interface Room {
  cell: Axial;
  door: Door;
}

/** Where the marble stands. */
export interface Spot {
  deck: Deck;
  cell: Axial;
}

// Radius 3 (#1249): the rooms of radius 2 stay where they are, the gallery ring around them holds the other bosses and
// the modes, and its other cells are floor.
export const HUB_CELLS: readonly Axial[] = cellsFor(3);
export const START: Spot = { deck: 'mess', cell: [0, 0] };

// The boss of each deck (world.md section 3, deck.ts).
const BOSS: Record<Deck, string> = {
  mess: 'echo',
  cargo: 'hull',
  furnace: 'choir',
  chapel: 'chaplain',
  bridge: 'ballast',
};
// The two lore entries of each deck (lore.ts).
const TERMINALS: Record<Deck, readonly [string, string]> = {
  mess: ['mess-house-rule', 'mess-corner-table'],
  cargo: ['cargo-assay', 'cargo-loadmaster'],
  furnace: ['furnace-power', 'furnace-watch-song'],
  chapel: ['chapel-door', 'chapel-sermon'],
  bridge: ['bridge-clamp', 'bridge-last-orders'],
};

// The gallery ring (#1249): the other bosses of each deck (README "The game", deck.ts) in roster order, then the modes
// with no table, the Open world on the Mess where every player starts.
const boss = (id: string): Door => ({ kind: 'boss', boss: id });
const GALLERY: Record<Deck, Door[]> = {
  mess: [boss('dual'), { kind: 'daily' }, { kind: 'world' }],
  cargo: [boss('alien'), boss('railyard'), boss('assembly'), boss('swarm'), { kind: 'run' }],
  furnace: [boss('magnetizer'), boss('core'), { kind: 'together' }],
  chapel: [boss('overseer'), boss('stalker')],
  bridge: [boss('pulsar'), { kind: 'ranked' }, { kind: 'trainer' }],
};
// Their cells, filled in this order: the north-east shoulder by the boss door, the north corners, then the south-west
// and south corners. No room is next to them in their row, so the plates never overlap, each keeps a floor cell
// next to it, and every floor cell stays reachable (hub.test.ts).
const GALLERY_SLOTS: readonly Axial[] = [[3, -2], [3, -3], [0, -3], [-3, 3], [0, 3]];

const LIFT_UP: Axial = [1, -2];
const LIFT_DOWN: Axial = [-1, 2];

function roomsFor(deck: Deck, i: number): Room[] {
  const [first, second] = TERMINALS[deck];
  const rooms: Room[] = [
    { cell: [2, 0], door: boss(BOSS[deck]) },
    { cell: [2, -1], door: { kind: 'terminal', lore: first } },
    { cell: [1, 1], door: { kind: 'terminal', lore: second } },
    { cell: [-1, -1], door: { kind: 'hotseat' } },
    { cell: [-2, 0], door: { kind: 'bot' } },
    { cell: [-2, 1], door: { kind: 'online' } },
    { cell: [-2, 2], door: { kind: 'royale' } }, // the battle royale lobby (#522, #593)
  ];
  if (deck === 'mess') rooms.push({ cell: [0, 2], door: { kind: 'medals' } });
  rooms.push(...GALLERY[deck].map((door, k) => ({ cell: GALLERY_SLOTS[k]!, door })));
  const up = DECK_NAMES[i + 1];
  const down = DECK_NAMES[i - 1];
  if (up) rooms.push({ cell: LIFT_UP, door: { kind: 'lift', to: up } });
  if (down) rooms.push({ cell: LIFT_DOWN, door: { kind: 'lift', to: down } });
  return rooms;
}

const ROOMS = Object.fromEntries(DECK_NAMES.map((deck, i) => [deck, roomsFor(deck, i)])) as Record<Deck, Room[]>;
const same = (a: Axial, b: Axial) => a[0] === b[0] && a[1] === b[1];

export function roomsOf(deck: Deck): readonly Room[] {
  return ROOMS[deck];
}

/** The door on a cell of a deck, `undefined` on a floor cell or off the map. */
export function roomAt(deck: Deck, cell: Axial): Door | undefined {
  return roomsOf(deck).find((room) => same(room.cell, cell))?.door;
}

/** The map cells next to a cell, in the order of the board directions. */
export function neighbours([q, r]: Axial): Axial[] {
  return DIRECTIONS.map(([dq, dr]): Axial => [q + dq, r + dr]).filter((n) => HUB_CELLS.some((c) => same(c, n)));
}

/** Only the lifts are gated: a lift onto a deck opens once the boss of the deck below it is beaten. */
export function canEnter(door: Door, beaten: readonly string[]): boolean {
  if (door.kind !== 'lift') return true;
  const below = DECK_NAMES[DECK_NAMES.indexOf(door.to) - 1];
  return !below || beaten.includes(BOSS[below]);
}

/** The marble after a roll to `to`: one neighbour cell, and an open lift carries it onto the lift back on the other
 * deck. Anything else (not a neighbour, a locked lift) leaves it where it is. */
export function step(at: Spot, to: Axial, beaten: readonly string[]): Spot {
  if (!neighbours(at.cell).some((n) => same(n, to))) return at;
  const door = roomAt(at.deck, to);
  if (door?.kind !== 'lift') return { deck: at.deck, cell: to };
  if (!canEnter(door, beaten)) return at;
  const up = DECK_NAMES.indexOf(door.to) > DECK_NAMES.indexOf(at.deck);
  return { deck: door.to, cell: up ? LIFT_DOWN : LIFT_UP };
}

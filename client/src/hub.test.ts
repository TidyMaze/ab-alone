import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { DECK_NAMES, deckOf, type Deck } from './deck';
import { canEnter, HUB_CELLS, neighbours, roomAt, roomsOf, START, step, type Spot } from './hub';
import { LORE } from './lore';

// The hub (docs/specs/game-design.md section 3.5): one small hex map per deck, rooms on the outer ring.
const key = (s: Spot) => `${s.deck} ${s.cell[0]},${s.cell[1]}`;

/** Every spot the marble can reach from the start by stepping to neighbours. */
function reachable(beaten: readonly string[]): Set<string> {
  const seen = new Set([key(START)]);
  const todo: Spot[] = [START];
  for (let at = todo.pop(); at; at = todo.pop()) {
    for (const to of neighbours(at.cell)) {
      const next = step(at, to, beaten);
      if (!seen.has(key(next))) {
        seen.add(key(next));
        todo.push(next);
      }
    }
  }
  return seen;
}

const ALL_BOSSES = ['echo', 'hull', 'choir', 'chaplain', 'ballast'];

describe('hub map (game-design.md section 3.5)', () => {
  it('each deck is a 19-cell hex of radius 2, the marble starts at the centre of the Mess', () => {
    expect(HUB_CELLS).toHaveLength(19);
    expect(HUB_CELLS.every(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2)).toBe(true);
    expect(START).toEqual({ deck: 'mess', cell: [0, 0] });
  });

  it('neighbours are the adjacent cells on the map', () => {
    expect(neighbours([0, 0])).toHaveLength(6);
    expect(neighbours([2, 0])).toEqual([
      [1, 0],
      [1, 1],
      [2, -1],
    ]);
    expect(neighbours([2, -1])).toHaveLength(4);
  });

  it('every deck has at least 6 rooms, each on its own outer-ring cell', () => {
    for (const deck of DECK_NAMES) {
      const cells = roomsOf(deck).map(({ cell: [q, r] }) => `${q},${r}`);
      expect(cells.length).toBeGreaterThanOrEqual(6);
      expect(new Set(cells).size).toBe(cells.length);
      for (const { cell } of roomsOf(deck)) {
        expect(HUB_CELLS).toContainEqual(cell);
        expect(neighbours(cell).length).toBeLessThan(6);
      }
    }
  });

  it('each deck has one boss room, the boss of that deck', () => {
    for (const deck of DECK_NAMES) {
      const bosses = roomsOf(deck).flatMap(({ door }) => (door.kind === 'boss' ? [door.boss] : []));
      expect(bosses).toHaveLength(1);
      expect(deckOf('boss', bosses[0])).toBe(deck);
    }
    expect(roomAt('mess', [2, 0])).toEqual({ kind: 'boss', boss: 'echo' });
  });

  it('every deck has a hot-seat, a bot and an online table', () => {
    for (const deck of DECK_NAMES) {
      const kinds = roomsOf(deck).map(({ door }) => door.kind);
      expect(kinds).toEqual(expect.arrayContaining(['hotseat', 'bot', 'online']));
    }
  });

  it('every deck has the battle royale lobby at the south-west corner, next to the online table (#522)', () => {
    for (const deck of DECK_NAMES) expect(roomAt(deck, [-2, 2])).toEqual({ kind: 'royale' });
  });

  it('the Mess has the Medal room at the south cell, no other deck has one (#812)', () => {
    expect(roomAt('mess', [0, 2])).toEqual({ kind: 'medals' });
    for (const deck of DECK_NAMES.filter((d) => d !== 'mess')) expect(roomAt(deck, [0, 2])).toBeUndefined();
  });

  it('each lore entry has one terminal room, on its own deck', () => {
    const terminals = DECK_NAMES.flatMap((deck) =>
      roomsOf(deck).flatMap(({ door }) => (door.kind === 'terminal' ? [`${deck} ${door.lore}`] : [])),
    );
    expect(terminals.sort()).toEqual(LORE.map((e) => `${e.deck} ${e.id}`).sort());
  });

  it('lifts link each deck to the next one: up at the top, down at the bottom', () => {
    const lifts = (deck: Deck) => roomsOf(deck).filter(({ door }) => door.kind === 'lift');
    expect(lifts('mess')).toEqual([{ cell: [1, -2], door: { kind: 'lift', to: 'cargo' } }]);
    expect(lifts('furnace')).toEqual([
      { cell: [1, -2], door: { kind: 'lift', to: 'chapel' } },
      { cell: [-1, 2], door: { kind: 'lift', to: 'cargo' } },
    ]);
    expect(lifts('bridge')).toEqual([{ cell: [-1, 2], door: { kind: 'lift', to: 'chapel' } }]);
  });

  it('a floor cell or a cell off the map is no room', () => {
    expect(roomAt('mess', [0, 0])).toBeUndefined();
    expect(roomAt('mess', [3, 0])).toBeUndefined();
  });
});

describe('canEnter: only the lifts are gated', () => {
  it('every other room opens with no boss beaten', () => {
    for (const deck of DECK_NAMES) {
      for (const { door } of roomsOf(deck)) {
        if (door.kind !== 'lift') expect(canEnter(door, [])).toBe(true);
      }
    }
  });

  it('a lift onto a deck opens once the boss of the deck below it is beaten', () => {
    expect(canEnter({ kind: 'lift', to: 'cargo' }, [])).toBe(false);
    expect(canEnter({ kind: 'lift', to: 'cargo' }, ['echo'])).toBe(true);
    expect(canEnter({ kind: 'lift', to: 'bridge' }, ['echo', 'hull', 'choir'])).toBe(false);
    expect(canEnter({ kind: 'lift', to: 'bridge' }, ['chaplain'])).toBe(true);
  });

  it('the lift down to the Mess is always open', () => {
    expect(canEnter({ kind: 'lift', to: 'mess' }, [])).toBe(true);
  });
});

describe('step: the marble rolls one cell at a time', () => {
  const at = (deck: Deck, cell: Axial): Spot => ({ deck, cell });

  it('rolls onto a neighbour floor cell or room', () => {
    expect(step(START, [1, 0], [])).toEqual(at('mess', [1, 0]));
    expect(step(at('mess', [1, 0]), [2, 0], [])).toEqual(at('mess', [2, 0]));
  });

  it('stays on a cell that is not a neighbour, off the map, or its own', () => {
    expect(step(START, [2, 0], [])).toBe(START);
    expect(step(at('mess', [2, 0]), [3, 0], [])).toEqual(at('mess', [2, 0]));
    expect(step(START, [0, 0], [])).toBe(START);
  });

  it('a locked lift keeps the marble out', () => {
    expect(step(at('mess', [1, -1]), [1, -2], [])).toEqual(at('mess', [1, -1]));
  });

  it('an open lift takes the marble onto the lift back of the other deck', () => {
    expect(step(at('mess', [1, -1]), [1, -2], ['echo'])).toEqual(at('cargo', [-1, 2]));
    expect(step(at('cargo', [-1, 1]), [-1, 2], [])).toEqual(at('mess', [1, -2]));
  });

  it('every room on every deck is reachable once every boss is beaten', () => {
    const seen = reachable(ALL_BOSSES);
    for (const deck of DECK_NAMES) {
      for (const { cell } of roomsOf(deck)) expect(seen).toContain(key(at(deck, cell)));
    }
  });

  it('with no boss beaten the marble never leaves the Mess', () => {
    expect([...reachable([])].every((s) => s.startsWith('mess '))).toBe(true);
  });
});

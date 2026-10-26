import { describe, expect, it } from 'vitest';
import { CELLS, VANISHED, type Axial } from './board';
import { frameShape } from './frame';
import { HUB_CELLS, neighbours } from './hub';
import { arrowCell, HUB_BOARD, hubHtml } from './hubview';

// The hub on screen (docs/specs/game-design.md section 3.5, #521): the board the map is drawn with, the arrow keys and
// the HUD plate.

describe('the hub board', () => {
  it('is floor on the 19 map cells and a hole everywhere else, so the frame shrinks to the map', () => {
    expect(HUB_BOARD).toHaveLength(CELLS.length);
    CELLS.forEach(([q, r], i) =>
      expect(HUB_BOARD[i]).toBe(HUB_CELLS.some(([hq, hr]) => hq === q && hr === r) ? 0 : VANISHED),
    );
    expect(frameShape(HUB_BOARD)).toMatchObject({ radius: 2, holes: [] });
  });
});

describe('the arrow keys', () => {
  it('roll left and right along the row', () => {
    expect(arrowCell([0, 0], 'ArrowLeft')).toEqual([-1, 0]);
    expect(arrowCell([1, -1], 'ArrowRight')).toEqual([2, -1]);
  });

  it('roll up and down in a zigzag that keeps the column: the centre reaches both lifts in two presses', () => {
    expect(arrowCell([0, 0], 'ArrowUp')).toEqual([1, -1]);
    expect(arrowCell([1, -1], 'ArrowUp')).toEqual([1, -2]);
    expect(arrowCell([0, 0], 'ArrowDown')).toEqual([0, 1]);
    expect(arrowCell([0, 1], 'ArrowDown')).toEqual([-1, 2]);
  });

  it('always roll to a neighbour, and down undoes up', () => {
    for (const cell of HUB_CELLS) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const [q, r] = arrowCell(cell, key)!;
        expect(Math.max(Math.abs(q - cell[0]), Math.abs(r - cell[1]), Math.abs(q + r - cell[0] - cell[1]))).toBe(1);
      }
      const up = arrowCell(cell, 'ArrowUp')!;
      expect(arrowCell(up, 'ArrowDown')).toEqual(cell);
    }
    expect(neighbours([0, 0])).toContainEqual(arrowCell([0, 0], 'ArrowUp'));
  });

  it('ignore every other key', () => {
    for (const key of ['Enter', 'a', ' ', 'Escape']) expect(arrowCell([0, 0], key)).toBeNull();
  });
});

describe('the hub HUD plate', () => {
  const at = (cell: Axial, deck: 'mess' | 'cargo' | 'bridge' = 'mess') => hubHtml({ deck, cell });

  it('names the ship and the deck, and nothing under the marble on a floor cell', () => {
    expect(at([0, 0])).toBe('<div class="turn"><span>Ship · Mess</span></div><small></small>');
    expect(at([0, 0], 'cargo')).toContain('Ship · Cargo');
  });

  it('names the room the marble stands on', () => {
    expect(at([2, 0])).toContain('<small>Boss door</small>');
    expect(at([2, -1])).toContain('<small>Terminal</small>');
    expect(at([-1, -1])).toContain('<small>Hot-seat table</small>');
    expect(at([-2, 0])).toContain('<small>Bot table</small>');
    expect(at([-2, 1])).toContain('<small>Online table</small>');
    expect(at([-2, 2])).toContain('<small>Battle royale lobby · closed</small>'); // until Phase 4 ships (#522)
    expect(at([1, -2])).toContain('<small>Lift to Cargo</small>');
    expect(at([-1, 2], 'bridge')).toContain('<small>Lift to Chapel</small>');
  });
});

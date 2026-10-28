import { describe, expect, it } from 'vitest';
import { CELLS, VANISHED, type Axial } from './board';
import { frameShape } from './frame';
import { HUB_CELLS, neighbours, type Spot } from './hub';
import { arrowCell, bossTitle, bumpLine, HUB_BOARD, hubHtml, hubTargetText, reachabilityText } from './hubview';

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
    expect(at([-2, 2])).toContain('<small>Battle royale lobby</small>'); // #522, #593
    expect(at([1, -2])).toContain('<small>Lift to Cargo</small>');
    expect(at([-1, 2], 'bridge')).toContain('<small>Lift to Chapel</small>');
  });
});

describe('a locked lift (#523)', () => {
  const below: Spot = { deck: 'mess', cell: [1, -1] };

  it('makes Tally say one short line when the marble bumps it', () => {
    expect(bumpLine(below, [1, -2], [])).toBe("Lift to Cargo: locked. This deck's boss is still on the books.");
    expect(bumpLine({ deck: 'cargo', cell: [0, -1] }, [1, -2], ['echo'])).toContain('Lift to Furnace: locked.');
  });

  it('says nothing for an open lift, another cell, or a lift more than one cell away', () => {
    expect(bumpLine(below, [1, -2], ['echo'])).toBe('');
    expect(bumpLine({ deck: 'cargo', cell: [0, 1] }, [-1, 2], [])).toBe(''); // the lift down is always open
    expect(bumpLine(below, [0, -1], [])).toBe('');
    expect(bumpLine({ deck: 'mess', cell: [0, 0] }, [1, -2], [])).toBe('');
  });

  it("puts Tally's line under the HUD plate", () => {
    expect(hubHtml(below, 'Locked.')).toBe(
      '<div class="turn"><span>Ship · Mess</span></div><small></small><div class="tally">Locked.</div>',
    );
  });
});

describe('hub target inspection and reachability (#628)', () => {
  const at: Spot = { deck: 'mess', cell: [0, 0] };

  it('reports reachability for neighbours, current cell, and distant cells', () => {
    expect(bossTitle('unknown')).toBe('Boss');
    expect(bossTitle('echo')).toBe('The Echo');
    expect(reachabilityText([0, 0], [0, 0])).toBe('Current position');
    expect(reachabilityText([0, 0], [1, 0])).toBe('Click to move');
    expect(reachabilityText([0, 0], [-1, 1])).toBe('Click to move');
    expect(reachabilityText([0, 0], [2, 0])).toBe('Out of reach (roll closer)');
    expect(reachabilityText([0, 0], [-2, 2])).toBe('Out of reach (roll closer)');
  });

  it('inspects all room kinds with descriptive names and mode subtitles', () => {
    expect(hubTargetText(at, [-2, 0])).toEqual({
      name: 'Bot table',
      desc: 'Practice match against AI',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [2, 0])).toEqual({
      name: 'Boss door',
      desc: 'The Echo (Mess boss)',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText({ deck: 'cargo', cell: [1, 0] }, [2, 0])).toEqual({
      name: 'Boss door',
      desc: 'The Hull (Cargo boss)',
      reach: 'Click to move',
    });
    expect(hubTargetText(at, [-1, -1])).toEqual({
      name: 'Hot-seat table',
      desc: '2 players, one screen',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText({ deck: 'mess', cell: [0, -1] }, [-1, -1])).toEqual({
      name: 'Hot-seat table',
      desc: '2 players, one screen',
      reach: 'Click to move',
    });
    expect(hubTargetText(at, [-2, 1])).toEqual({
      name: 'Online table',
      desc: 'Peer-to-peer 1v1 match',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [-2, 2])).toEqual({
      name: 'Battle royale lobby',
      desc: 'Multi-player battle royale',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [0, 2])).toEqual({
      name: 'Medal room',
      desc: 'Every boss, its medal and best turns',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [2, -1])).toEqual({
      name: 'Terminal',
      desc: 'Ship archive and audio log',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [1, -2])).toEqual({
      name: 'Lift to Cargo',
      desc: 'Transit to Cargo',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [1, 0])).toEqual({
      name: 'Deck floor',
      desc: 'Open transit corridor',
      reach: 'Click to move',
    });
  });

  it('renders preview in hubHtml when hover is provided', () => {
    const html = hubHtml(at, '', [-2, 0]);
    expect(html).toContain('class="hub-preview"');
    expect(html).toContain('Target: Bot table · Practice match against AI');
    expect(html).toContain('(Out of reach (roll closer))');

    const near = hubHtml({ deck: 'mess', cell: [-1, 0] }, '', [-2, 0]);
    expect(near).toContain('Target: Bot table · Practice match against AI');
    expect(near).toContain('(Click to move)');
  });

  it('omits preview in hubHtml when hover is null', () => {
    expect(hubHtml(at, '', null)).not.toContain('class="hub-preview"');
  });
});

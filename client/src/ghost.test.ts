import { describe, expect, it } from 'vitest';
import { cellIndex } from './board';
import { ghostMarbles, type GhostEngine } from './ghost';

const empty = (): number[] => new Array<number>(61).fill(0);
const put = (cells: Array<[number, number, number]>): number[] => {
  const b = empty();
  for (const [q, r, side] of cells) b[cellIndex(q, r)] = side;
  return b;
};

/** Engine whose board is scripted: `states[n]` is the board after n plays. */
function fake(states: number[][], failOn = -1) {
  const played: number[][] = [];
  const make = (): GhostEngine => {
    const n = { count: 0 };
    return {
      play(mv) {
        if (n.count === failOn) throw new Error('illegal');
        played.push(Array.from(mv));
        n.count++;
      },
      board: () => states[n.count]!,
    };
  };
  return { make, played };
}

describe('ghostMarbles', () => {
  it('shows nothing when no move is hovered', () => {
    const { make, played } = fake([empty()]);
    expect(ghostMarbles([], null, make)).toEqual([]);
    expect(played).toEqual([]);
  });

  it('shows the landing cell of a one marble move, not the emptied cell', () => {
    const { make, played } = fake([put([[0, 2, 1]]), put([[0, 1, 1]])]);
    const record = [1, 4, 0, 2, 0, 0, 0, 0];
    expect(ghostMarbles([], record, make)).toEqual([{ cell: [0, 1], side: 1 }]);
    expect(played).toEqual([record]);
  });

  it('shows the pushed marble too and replays the history first', () => {
    const before = put([[0, 2, 1], [0, 1, 1], [0, 0, 2]]);
    const after = put([[0, 1, 1], [0, 0, 1], [0, -1, 2]]);
    const { make, played } = fake([empty(), before, after]);
    const hist = [[1, 0, 0, 0, 0, 0, 0, 0]];
    const record = [2, 4, 0, 2, 0, 1, 0, 0];
    expect(ghostMarbles(hist, record, make)).toEqual([
      { cell: [0, -1], side: 2 },
      { cell: [0, 0], side: 1 },
    ]);
    expect(played).toEqual([hist[0], record]);
  });

  it('shows nothing for a pushed out marble beyond the edge, only the movers', () => {
    const before = put([[0, 3, 1], [0, 4, 2]]);
    const after = put([[0, 4, 1]]);
    const { make } = fake([before, after]);
    expect(ghostMarbles([], [1, 5, 0, 3, 0, 0, 0, 0], make)).toEqual([{ cell: [0, 4], side: 1 }]);
  });

  it('draws no ghost on a cell that vanishes in that ply, The Hull', () => {
    const before = put([[0, 2, 1], [4, -1, 2]]);
    const after = put([[0, 1, 1], [4, -1, 3], [3, -1, 3]]); // a marble cell and an empty cell vanish
    const { make } = fake([before, after]);
    expect(ghostMarbles([], [1, 4, 0, 2, 0, 0, 0, 0], make)).toEqual([{ cell: [0, 1], side: 1 }]);
  });

  it('shows nothing when the engine rejects the move', () => {
    const { make } = fake([empty(), empty()], 1);
    // play 0 (history) succeeds, play 1 (hovered move) throws
    expect(ghostMarbles([[1, 0, 0, 0, 0, 0, 0, 0]], [1, 0, 0, 0, 0, 0, 0, 0], make)).toEqual([]);
  });
});

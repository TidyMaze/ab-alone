import { describe, expect, it } from 'vitest';
import init, { Engine } from 'abalone-wasm';
import { CELLS, cellIndex, encodeMove, parseMoves, type Axial, type Move } from './board';
import { blockers, hexDistance, resolveSeen, seenBoard, seenGhosts, seenMoves, STALKER_RANGE, visibleCells } from './stalker';

// Stalker (#783, #998, game-design.md section 3.4): the visible set and the moves the player is offered on the board
// as it is seen. The judge of seenMoves is the real rules engine: with nothing hidden, it offers the engine's moves.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
await init({ module_or_path: await readFile(new URL('../../crates/abalone-wasm/pkg/abalone_wasm_bg.wasm', import.meta.url)) });

/** A board of 61 cells holding only these marbles. */
const boardOf = (marbles: [Axial, number][]): number[] => {
  const board = CELLS.map(() => 0);
  for (const [[q, r], side] of marbles) board[cellIndex(q, r)] = side;
  return board;
};
const key = (mv: Move): string => `${mv.dir}:${mv.cells.map(([q, r]) => `${q},${r}`).sort().join(' ')}`;
const keys = (moves: Move[]): string[] => moves.map(key).sort();

describe('hexDistance', () => {
  it('is 0 on the same cell, 1 to a neighbour, 8 between opposite corners', () => {
    expect(hexDistance([1, -2], [1, -2])).toBe(0);
    expect(hexDistance([0, 0], [1, -1])).toBe(1);
    expect(hexDistance([0, 0], [0, 1])).toBe(1);
    expect(hexDistance([4, -4], [-4, 4])).toBe(8);
    expect(hexDistance([4, 0], [-4, 0])).toBe(8);
  });
});

describe('visibleCells', () => {
  it('sees the 19 cells within 2 of a lone marble on the centre', () => {
    const seen = visibleCells(boardOf([[[0, 0], 1]]), 1, STALKER_RANGE);
    expect(seen.size).toBe(19);
    expect(seen.has(cellIndex(2, -2))).toBe(true);
    expect(seen.has(cellIndex(3, -3))).toBe(false);
  });

  it('sees 9 cells from a corner: the edge clips the range', () => {
    expect(visibleCells(boardOf([[[4, -4], 1]]), 1, 2).size).toBe(9);
  });

  it('is empty for a side with no marble, and the enemy marbles see nothing for it', () => {
    expect(visibleCells(boardOf([[[0, 0], 2]]), 1, 2).size).toBe(0);
  });

  it('is the union of the ranges of every own marble', () => {
    const seen = visibleCells(new Engine().board(), 1, 2);
    expect(seen.has(cellIndex(0, 0))).toBe(true); // 2 from the front row (r = 2)
    expect(seen.has(cellIndex(0, -1))).toBe(false); // White's side: 3 away
  });
});

describe('seenBoard', () => {
  it('empties the enemy marbles out of range, keeps the revealed ones, the own ones and the seen ones', () => {
    const board = boardOf([[[0, 0], 1], [[2, 0], 2], [[3, 0], 2], [[-4, 4], 2]]);
    const seen = seenBoard(board, 1, visibleCells(board, 1, 2), new Set([cellIndex(-4, 4)]));
    expect(seen).toEqual(boardOf([[[0, 0], 1], [[2, 0], 2], [[-4, 4], 2]]));
  });
});

describe('seenMoves', () => {
  it('offers the engine moves when nothing is hidden, on the start and along a played game', () => {
    const engine = new Engine();
    for (let ply = 0; ply < 40 && engine.status() === 0; ply++) {
      const legal = parseMoves(engine.legal_moves());
      expect(keys(seenMoves(engine.board(), engine.to_move()))).toEqual(keys(legal));
      engine.play(Int32Array.from(encodeMove(legal[(ply * 7) % legal.length]!)));
    }
  });

  it('offers the push ejections and the sumito of 3 on 2, never 2 on 2 nor a push into an own marble', () => {
    const push = boardOf([[[2, 0], 1], [[3, 0], 1], [[4, 0], 2]]); // 2 on 1 at the rim: the ejection
    expect(keys(seenMoves(push, 1))).toContain(key({ cells: [[2, 0], [3, 0]], dir: 0 }));
    const three = boardOf([[[-2, 0], 1], [[-1, 0], 1], [[0, 0], 1], [[1, 0], 2], [[2, 0], 2]]);
    expect(keys(seenMoves(three, 1))).toContain(key({ cells: [[-2, 0], [-1, 0], [0, 0]], dir: 0 }));
    expect(keys(seenMoves(three, 1))).not.toContain(key({ cells: [[-1, 0], [0, 0]], dir: 0 }));
    const own = boardOf([[[0, 0], 1], [[1, 0], 1], [[2, 0], 2], [[3, 0], 1]]);
    expect(keys(seenMoves(own, 1))).not.toContain(key({ cells: [[0, 0], [1, 0]], dir: 0 }));
  });
});

describe('resolveSeen', () => {
  it('finds the legal move of the same marbles and direction, whatever their order, else null', () => {
    const legal: Move[] = [{ cells: [[1, 0], [0, 0]], dir: 0 }];
    expect(resolveSeen(legal, { cells: [[0, 0], [1, 0]], dir: 0 })).toBe(legal[0]);
    expect(resolveSeen(legal, { cells: [[0, 0], [1, 0]], dir: 1 })).toBeNull();
    expect(resolveSeen(legal, { cells: [[0, 0]], dir: 0 })).toBeNull();
  });
});

describe('blockers', () => {
  it('names the hidden marbles in the line of an inline push', () => {
    const board = boardOf([[[0, 0], 1], [[1, 0], 1], [[2, 0], 2], [[3, 0], 2], [[4, 0], 1]]);
    const seen = boardOf([[[0, 0], 1], [[1, 0], 1], [[2, 0], 2], [[4, 0], 1]]);
    expect(blockers(board, seen, { cells: [[0, 0], [1, 0]], dir: 0 })).toEqual([cellIndex(3, 0)]);
  });

  it('names the hidden marble on a broadside target, not the ones behind it', () => {
    const board = boardOf([[[0, 0], 1], [[1, 0], 1], [[1, -1], 2], [[1, -2], 2]]);
    const seen = boardOf([[[0, 0], 1], [[1, 0], 1]]);
    expect(blockers(board, seen, { cells: [[0, 0], [1, 0]], dir: 4 })).toEqual([cellIndex(1, -1)]);
  });

  it('stops at the rim', () => {
    const board = boardOf([[[3, 0], 1], [[4, 0], 2]]);
    expect(blockers(board, boardOf([[[3, 0], 1]]), { cells: [[3, 0]], dir: 0 })).toEqual([cellIndex(4, 0)]);
  });
});

describe('seenGhosts', () => {
  it('moves the group and the marbles it pushes one cell on, those pushed off the board are gone', () => {
    const board = boardOf([[[2, 0], 1], [[3, 0], 1], [[4, 0], 2]]);
    expect(seenGhosts(board, { cells: [[2, 0], [3, 0]], dir: 0 })).toEqual([
      { cell: [3, 0], side: 1 },
      { cell: [4, 0], side: 1 },
    ]);
    expect(seenGhosts(board, { cells: [[2, 0], [3, 0]], dir: 4 })).toEqual([
      { cell: [2, -1], side: 1 },
      { cell: [3, -1], side: 1 },
    ]);
  });
});

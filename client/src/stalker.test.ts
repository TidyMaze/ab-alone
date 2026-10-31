import { describe, expect, it } from 'vitest';
import init, { Engine } from 'abalone-wasm';
import { CELLS, cellIndex, type Axial } from './board';
import { hexDistance, visibleCells } from './stalker';

// Stalker (#783, #998, game-design.md section 3.8): the visible set and the moves the player is offered on the board
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
    const seen = visibleCells(boardOf([[[0, 0], 1]]), 1, 2);
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

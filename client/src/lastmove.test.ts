import { describe, expect, it } from 'vitest';
import { MOTION } from './motion';
import { SLIDE_MS } from './slide';
import { CORE_CODE, cellIndex } from './board';
import { LAST_MOVE_REST, botMoveNote, lastMovePulse, pushedMarbles } from './lastmove';

describe('lastMovePulse', () => {
  it('peaks when the slide ends and fades to the resting mark over the base duration', () => {
    expect(lastMovePulse(SLIDE_MS, false)).toEqual({ opacity: 1, scale: 1.4 });
    const mid = lastMovePulse(SLIDE_MS + MOTION.base / 2, false);
    expect(mid.opacity).toBeGreaterThan(LAST_MOVE_REST);
    expect(mid.opacity).toBeLessThan(1);
    expect(lastMovePulse(SLIDE_MS + MOTION.base, false)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
    expect(lastMovePulse(99999, false)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
  });
  it('rests during the slide', () => {
    expect(lastMovePulse(0, false)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
  });
  it('is a static mark under reduced motion', () => {
    expect(lastMovePulse(SLIDE_MS, true)).toEqual({ opacity: LAST_MOVE_REST, scale: 1 });
  });
});

describe('botMoveNote', () => {
  it('names the marbles moved and the direction', () => {
    expect(botMoveNote({ cells: [[0, 0]], dir: 2 }, 0)).toBe('Bot moved 1 marble up-right');
    expect(botMoveNote({ cells: [[0, 0], [1, 0]], dir: 1 }, 0)).toBe('Bot moved 2 marbles left');
  });
  it('adds the marbles of yours it pushed', () => {
    expect(botMoveNote({ cells: [[0, 0], [1, 0]], dir: 5 }, 1)).toBe('Bot moved 2 marbles down-right and pushed 1 of yours');
    expect(botMoveNote({ cells: [[0, 0]], dir: 0 }, 2)).toBe('Bot moved 1 marble right and pushed 2 of yours');
  });
});

describe('pushedMarbles', () => {
  it('counts the marbles pushed, not the cores', () => {
    const board = new Array(61).fill(0);
    board[cellIndex(0, 0)] = 2;
    board[cellIndex(1, 0)] = 1;
    board[cellIndex(2, 0)] = CORE_CODE;
    expect(pushedMarbles(board, { cells: [[0, 0]], dir: 0 })).toBe(1);
    expect(pushedMarbles(board, { cells: [[0, 0]], dir: 1 })).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { engineAt, replayKey, replayLabel, stepPly } from './replay';

describe('stepPly', () => {
  it('moves to the first, previous, next and last position', () => {
    expect(stepPly(3, 'first', 5)).toBe(0);
    expect(stepPly(3, 'prev', 5)).toBe(2);
    expect(stepPly(3, 'next', 5)).toBe(4);
    expect(stepPly(3, 'last', 5)).toBe(5);
  });

  it('stays inside the move log', () => {
    expect(stepPly(0, 'prev', 5)).toBe(0);
    expect(stepPly(5, 'next', 5)).toBe(5);
  });
});

describe('replayKey', () => {
  it('Left and Right step, whether the replay is open or not for Left', () => {
    expect(replayKey('ArrowLeft', true, true)).toBe('prev');
    expect(replayKey('ArrowRight', true, true)).toBe('next');
    expect(replayKey('ArrowLeft', false, true)).toBe('prev'); // opens the replay one move back
  });

  it('Right and Escape do nothing while the replay is closed, Left nothing without a move', () => {
    expect(replayKey('ArrowRight', false, true)).toBeNull();
    expect(replayKey('Escape', false, true)).toBeNull();
    expect(replayKey('ArrowLeft', false, false)).toBeNull();
  });

  it('Escape returns to the live game', () => {
    expect(replayKey('Escape', true, true)).toBe('live');
  });

  it('ignores other keys', () => {
    expect(replayKey('x', true, true)).toBeNull();
  });
});

describe('replayLabel', () => {
  it('says the position and the length of the log', () => {
    expect(replayLabel(3, 10)).toBe('Move 3 of 10');
    expect(replayLabel(10, 10)).toBe('Move 10 of 10 (live)');
  });
});

describe('engineAt', () => {
  /** An engine that only remembers the moves it was given. */
  const make = () => {
    const played: number[][] = [];
    return { played, play: (mv: Int32Array) => void played.push(Array.from(mv)), status: () => 0 };
  };
  const log = [[1], [2], [3]];

  it('is a new engine after the first `ply` moves of the log', () => {
    expect(engineAt(log, 2, make).played).toEqual([[1], [2]]);
  });

  it('is a new engine at ply 0', () => {
    expect(engineAt(log, 0, make).played).toEqual([]);
  });
});

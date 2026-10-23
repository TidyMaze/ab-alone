import { describe, expect, it } from 'vitest';
import { formatScore } from './score';

describe('formatScore', () => {
  it('shows 0/6 for both sides at the start', () => {
    expect(formatScore([0, 0], 0)).toBe('Black ejected 0/6 · White ejected 0/6');
  });

  it('shows each side count out of 6 while the game runs', () => {
    expect(formatScore([2, 5], 0)).toBe('Black ejected 2/6 · White ejected 5/6');
  });

  it('names the winner and the 6-ejection rule once the game is over', () => {
    expect(formatScore([6, 3], 1)).toBe(
      'Black wins by 6 ejections · Black ejected 6/6 · White ejected 3/6',
    );
    expect(formatScore([2, 6], 2)).toBe(
      'White wins by 6 ejections · Black ejected 2/6 · White ejected 6/6',
    );
  });

  it('says draw without a rule, the engine does not report which one ended it', () => {
    expect(formatScore([3, 3], 3)).toBe('Draw · Black ejected 3/6 · White ejected 3/6');
  });
});

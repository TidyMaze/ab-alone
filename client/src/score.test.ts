import { describe, expect, it } from 'vitest';
import { formatScore } from './score';

describe('formatScore', () => {
  it('shows 0/6 for both sides at the start', () => {
    expect(formatScore([0, 0], [6, 6], 0, 0, 2)).toBe('Black ejected 0/6 · White ejected 0/6');
  });

  it('shows each side count out of 6 while the game runs', () => {
    expect(formatScore([2, 5], [6, 6], 0, 0, 2)).toBe('Black ejected 2/6 · White ejected 5/6');
  });

  it('drops redundant winner name when the game is over (#425)', () => {
    expect(formatScore([6, 3], [6, 6], 1, 0, 2)).toBe('Black ejected 6/6 · White ejected 3/6');
    expect(formatScore([2, 6], [6, 6], 2, 0, 2)).toBe('Black ejected 2/6 · White ejected 6/6');
  });

  it('counts each side against its own threshold: the Choir is won at 10 (Decision #131)', () => {
    expect(formatScore([3, 1], [10, 6], 0, 0, 2)).toBe('Black ejected 3/10 · White ejected 1/6');
    expect(formatScore([10, 2], [10, 6], 1, 0, 2)).toBe('Black ejected 10/10 · White ejected 2/6');
  });

  it('drops redundant draw reason since end banner and turn already show it (#425)', () => {
    expect(formatScore([3, 3], [6, 6], 3, 1, 2)).toBe('Black ejected 3/6 · White ejected 3/6');
    expect(formatScore([3, 3], [6, 6], 3, 2, 2)).toBe('Black ejected 3/6 · White ejected 3/6');
  });

  it('names the pale glass side White against the bot: side 1 is White', () => {
    expect(formatScore([2, 5], [6, 6], 0, 0, 1)).toBe('White ejected 2/6 · Black ejected 5/6');
    expect(formatScore([6, 3], [6, 6], 1, 0, 1)).toBe('White ejected 6/6 · Black ejected 3/6');
  });
});

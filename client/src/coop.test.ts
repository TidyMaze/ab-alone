import { describe, expect, it } from 'vitest';
import { COOP_SIDE, seatOfPly } from './coop';

describe('co-op turns, docs/specs/coop-boss.md section 2', () => {
  it('gives human ply k to seat (k % seats) + 1: the creator first, then the partner, in turn', () => {
    expect([0, 1, 2, 3].map((k) => seatOfPly(k, 2))).toEqual([1, 2, 1, 2]);
    expect([0, 1, 2, 3].map((k) => seatOfPly(k, 3))).toEqual([1, 2, 3, 1]);
  });

  it('has every player seat play Black against the boss', () => {
    expect(COOP_SIDE).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { contactOf, heldClock, HIT_HOLD_MS } from './openworldhit';

describe('the hold on the contact of a push (#1561)', () => {
  it('holds between 40 and 60 ms', () => {
    expect(HIT_HOLD_MS).toBeGreaterThanOrEqual(40);
    expect(HIT_HOLD_MS).toBeLessThanOrEqual(60);
  });

  it('runs the clock as it is before the contact, stands still for the hold, then runs on, late by the hold', () => {
    expect(heldClock(100, 160, 50)).toBe(100);
    expect(heldClock(160, 160, 50)).toBe(160);
    expect(heldClock(185, 160, 50)).toBe(160);
    expect(heldClock(210, 160, 50)).toBe(160);
    expect(heldClock(260, 160, 50)).toBe(210);
  });

  it('is the plain clock with no hold', () => {
    expect(heldClock(300, 160, 0)).toBe(300);
  });

  it('finds the contact: the cell the head of the moved line goes to, where the first enemy stood', () => {
    const from: Axial[] = [[1, 0], [0, 0], [-1, 0], [-2, 0]];
    const to: Axial[] = [[2, 0], [1, 0], [0, 0], [-2, 0]];
    expect(contactOf(from, to)).toEqual([2, 0]);
  });

  it('finds no contact when no marble moved', () => {
    expect(contactOf([[0, 0]], [[0, 0]])).toBeNull();
  });
});

type Axial = [number, number];

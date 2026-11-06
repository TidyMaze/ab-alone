import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { RECRUIT_MAX, recruitCell } from './openworldrecruit';

// The recruit of a marble a push ejected (#1531, docs/specs/openworld.md section 16): the cell it appears on, and the cap.
const open = (): boolean => true;
const hex = (a: Axial, b: Axial): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] - b[0] + a[1] - b[1])) / 2;

describe('the cap on recruits', () => {
  it('is five, a third of the troop of fifteen', () => {
    expect(RECRUIT_MAX).toBe(5);
  });
});

describe('the cell a recruit appears on', () => {
  it('is the free cell nearest the hero, never the hero\'s own', () => {
    const cell = recruitCell([4, 4], [], 0, open)!;
    expect(hex(cell, [4, 4])).toBe(1);
  });

  it('is the same cell every time for the same troop: the nearest, then the first in the order of the teleport arrival', () => {
    expect(recruitCell([0, 0], [], 0, open)).toEqual(recruitCell([0, 0], [], 0, open));
    expect(recruitCell([0, 0], [], 0, open)).toEqual([-1, 0]);
  });

  it('skips the cells the troop holds and the cells `free` refuses', () => {
    const ring: Axial[] = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
    expect(hex(recruitCell([0, 0], ring.slice(0, 3), 0, open)!, [0, 0])).toBe(1); // a ring of one cell has room left
    const taken = recruitCell([0, 0], ring, 0, open)!;
    expect(hex(taken, [0, 0])).toBe(2); // the whole first ring is the troop's: the next ring
    const refused = recruitCell([0, 0], [], 0, ([q, r]) => !(q === -1 && r === 0))!;
    expect(refused).not.toEqual([-1, 0]);
  });

  it('is none past the cap, and none when nothing within three cells is free', () => {
    expect(recruitCell([0, 0], [], RECRUIT_MAX, open)).toBeNull();
    expect(recruitCell([0, 0], [], RECRUIT_MAX - 1, open)).not.toBeNull();
    expect(recruitCell([0, 0], [], 0, () => false)).toBeNull();
    expect(recruitCell([0, 0], [], 0, ([q, r]) => hex([q, r], [0, 0]) > 3)).toBeNull();
  });
});

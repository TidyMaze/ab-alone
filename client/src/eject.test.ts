import { describe, expect, it } from 'vitest';
import { axialTo3D, cellIndex, DIRECTIONS } from './board';
import { EJECT_MS, ejectTrack, findEjection, trackAt } from './eject';

const empty = (): number[] => new Array<number>(61).fill(0);
const put = (cells: Array<[number, number, number]>): number[] => {
  const b = empty();
  for (const [q, r, side] of cells) b[cellIndex(q, r)] = side;
  return b;
};

describe('ejectTrack', () => {
  it('slides the marble one step past the rim along the push direction and fades it over 600 ms', () => {
    const track = ejectTrack([-2, -2], 4, false); // NW, the (-2,-3) neighbour is off the board
    const from = axialTo3D(-2, -2);
    const step = axialTo3D(...DIRECTIONS[4]!);
    expect(track.durationMs).toBe(EJECT_MS);
    expect(EJECT_MS).toBe(600);
    expect(track.fade).toBe(true);
    expect(track.from).toEqual({ x: from.x, z: from.z });
    expect(track.to.x).toBeCloseTo(from.x + step.x * 1.5);
    expect(track.to.z).toBeCloseTo(from.z + step.z * 1.5);
  });

  it('has zero duration, no fade and no travel with reduced motion', () => {
    const track = ejectTrack([-2, -2], 4, true);
    expect(track.durationMs).toBe(0);
    expect(track.fade).toBe(false);
    expect(track.to).toEqual(track.from);
  });
});

describe('trackAt', () => {
  const track = ejectTrack([0, 0], 0, false); // E

  it('starts at the start, opaque', () => {
    expect(trackAt(track, 0)).toEqual({ x: 0, z: 0, opacity: 1 });
  });

  it('is halfway and half faded at 300 ms', () => {
    const p = trackAt(track, 300);
    expect(p.x).toBeCloseTo(0.75);
    expect(p.opacity).toBeCloseTo(0.5);
  });

  it('stays at the end, invisible, once the duration has passed', () => {
    const p = trackAt(track, 5000);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.opacity).toBe(0);
  });

  it('reduced motion: gone at once, never moves', () => {
    expect(trackAt(ejectTrack([0, 0], 0, true), 0)).toEqual({ x: 0, z: 0, opacity: 0 });
  });

  it('a track without fade stays opaque until its end', () => {
    const t = { ...track, fade: false };
    expect(trackAt(t, 100).opacity).toBe(1);
    expect(trackAt(t, 600).opacity).toBe(0);
  });
});

describe('findEjection', () => {
  // Black trio on the q = -2 column pushes two White marbles NW: the last one leaves the board.
  const move = { cells: [[-2, 0], [-2, 1], [-2, 2]] as [number, number][], dir: 4 };
  const before = put([[-2, 0, 1], [-2, 1, 1], [-2, 2, 1], [-2, -1, 2], [-2, -2, 2]]);
  const after = put([[-2, -1, 1], [-2, 0, 1], [-2, 1, 1], [-2, -2, 2]]);

  it('returns the cell and side of the marble that left the board', () => {
    expect(findEjection(before, after, move)).toEqual({ cell: [-2, -2], side: 2 });
  });

  it('is null when no marble was lost', () => {
    expect(findEjection(before, before, move)).toBeNull();
  });

  it('counts marbles only: a vanished cell and the marble it took are no push ejection, The Hull', () => {
    const step = { cells: [[0, 2]] as [number, number][], dir: 4 };
    expect(findEjection(put([[0, 2, 1]]), put([[0, 1, 1], [4, -1, 3]]), step)).toBeNull();
    expect(findEjection(put([[0, 2, 1], [4, -1, 2]]), put([[0, 1, 1], [4, -1, 3]]), step)).toBeNull();
  });

  it('ejects at the edge of a hole: a push onto a vanished cell, The Hull', () => {
    const push = { cells: [[-1, 0], [0, 0]] as [number, number][], dir: 0 }; // E, (2,0) is gone
    const b = put([[-1, 0, 1], [0, 0, 1], [1, 0, 2], [2, 0, 3]]);
    const a = put([[0, 0, 1], [1, 0, 1], [2, 0, 3]]);
    expect(findEjection(b, a, push)).toEqual({ cell: [1, 0], side: 2 });
  });
});

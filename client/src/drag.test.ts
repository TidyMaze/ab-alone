import { describe, expect, it } from 'vitest';
import { type Axial, DIRECTIONS, axialTo3D } from './board';
import { extendPath, releaseDir } from './drag';

// The pure logic of the drag play (#794): the path over the player's marbles and the release toward a direction.

describe('extendPath', () => {
  it('starts a path with its first marble', () => {
    expect(extendPath([], [0, 0])).toEqual([[0, 0]]);
  });

  it('adds an in-line neighbour at either end, up to three marbles', () => {
    const two = extendPath([[0, 0]], [1, 0]);
    expect(two).toEqual([[0, 0], [1, 0]]);
    const three = extendPath(two, [-1, 0]); // before the start
    expect(three).toEqual([[0, 0], [1, 0], [-1, 0]]);
    expect(extendPath(three, [2, 0])).toBe(three); // a fourth never joins
  });

  it('ignores a marble already in the path, a far one and one off the line', () => {
    const two: Axial[] = [[0, 0], [1, 0]];
    expect(extendPath(two, [1, 0])).toBe(two);
    expect(extendPath(two, [3, 0])).toBe(two);
    expect(extendPath(two, [1, 1])).toBe(two); // bent
    expect(extendPath([[0, 0]], [2, 0])).toEqual([[0, 0]]);
  });
});

describe('releaseDir', () => {
  const at = (q: number, r: number): { x: number; z: number } => axialTo3D(q, r);

  it('is the direction from the group to the pointer, for each of the six', () => {
    for (const [dir, [dq, dr]] of DIRECTIONS.entries()) {
      const p = at(1.5 * dq, 1.5 * dr);
      expect(releaseDir([[0, 0]], p.x, p.z)).toBe(dir);
    }
  });

  it('takes the nearest direction from the centre of the group', () => {
    const p = at(1.6, 0.3); // east, a little to the south-east
    expect(releaseDir([[0, 0]], p.x, p.z)).toBe(0);
    const q = at(2.5, 0); // beside a pair, ahead of its centre
    expect(releaseDir([[0, 0], [1, 0]], q.x, q.z)).toBe(0);
    const b = at(0.5, 1.5); // below the pair
    expect(releaseDir([[0, 0], [1, 0]], b.x, b.z)).toBe(5);
  });

  it('is null while the pointer is still on a marble of the group', () => {
    const on = at(1.1, 0);
    expect(releaseDir([[0, 0], [1, 0]], on.x, on.z)).toBeNull();
    const tip = at(0.2, 0.1);
    expect(releaseDir([[0, 0]], tip.x, tip.z)).toBeNull();
  });
});

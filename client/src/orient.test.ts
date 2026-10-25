import { describe, expect, it } from 'vitest';
import { CELLS, DIRECTIONS, cellIndex, type Axial, type Move } from './board';
import { carryTurns, cellTurn, inHolder, marbleTurn, random, rolledTurn, turnOf, type Quat } from './orient';
import { slideTracks } from './slide';

const length = (q: Quat): number => Math.hypot(...q);
// Two unit quaternions give the same rotation when they are equal or opposite.
const sameRotation = (a: Quat, b: Quat): void => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  expect(Math.abs(dot)).toBeCloseTo(1, 9);
};
const put = (cells: Array<[number, number, number]>): number[] => {
  const b = new Array<number>(61).fill(0);
  for (const [q, r, side] of cells) b[cellIndex(q, r)] = side;
  return b;
};
const move = (dir: number, ...cells: Axial[]): Move => ({ cells, dir });
const at = (q: number, r: number): number => cellIndex(q, r);

describe('random', () => {
  it('gives the same number in [0, 1) for the same seed and key', () => {
    for (let key = 0; key < 200; key += 1) {
      const x = random(7, key);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      expect(random(7, key)).toBe(x);
    }
  });

  it('changes with the seed and with the key, spread over [0, 1)', () => {
    expect(random(1, 5)).not.toBe(random(2, 5));
    expect(random(1, 5)).not.toBe(random(1, 6));
    const xs = Array.from({ length: 1000 }, (_, key) => random(0, key));
    expect(new Set(xs).size).toBe(1000);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(xs.filter((x) => x < 0.1)).not.toHaveLength(0);
    expect(xs.filter((x) => x > 0.9)).not.toHaveLength(0);
  });
});

describe('cellTurn', () => {
  it('turns each cell by an angle in [0, 2π), the same on every board', () => {
    for (let i = 0; i < CELLS.length; i += 1) {
      expect(cellTurn(i)).toBeGreaterThanOrEqual(0);
      expect(cellTurn(i)).toBeLessThan(2 * Math.PI);
      expect(cellTurn(i)).toBe(cellTurn(i));
    }
  });

  it('turns neighbouring cells by different angles', () => {
    for (const [q, r] of CELLS) {
      for (const [dq, dr] of DIRECTIONS) {
        const n = cellIndex(q + dq, r + dr);
        if (n !== -1) expect(cellTurn(n)).not.toBe(cellTurn(cellIndex(q, r)));
      }
    }
  });
});

describe('marbleTurn', () => {
  it('is a valid rotation: a unit quaternion', () => {
    for (let i = 0; i < CELLS.length; i += 1) expect(length(marbleTurn(3, i))).toBeCloseTo(1, 12);
  });

  it('is the same for the same seed and marble, different for different marbles or seeds', () => {
    expect(marbleTurn(3, 10)).toEqual(marbleTurn(3, 10));
    const all = CELLS.map((_, i) => marbleTurn(3, i).join());
    expect(new Set(all).size).toBe(CELLS.length);
    expect(marbleTurn(4, 10)).not.toEqual(marbleTurn(3, 10));
  });
});

describe('turnOf', () => {
  it('gives the seeded turn of a marble never moved, keyed by its starting cell', () => {
    expect(turnOf(new Map(), 3, 12)).toEqual(marbleTurn(3, 12));
  });

  it('gives the turn a marble carried to its cell', () => {
    const turn: Quat = [0, 0, 0, 1];
    expect(turnOf(new Map([[12, turn]]), 3, 12)).toBe(turn);
  });
});

describe('carryTurns and rolledTurn', () => {
  it('a sliding marble takes its own turn to its new cell, rolled one cell: no jump at either end of the slide', () => {
    const before = put([[0, 2, 1]]);
    const after = put([[0, 1, 1]]);
    const [track] = slideTracks(before, after, move(4, [0, 2]), false);
    const turns = carryTurns(new Map(), 3, [track!], 4);
    const end = turns.get(at(0, 1))!;
    sameRotation(rolledTurn(track!, 0, end), marbleTurn(3, at(0, 2))); // starts as it was on its old cell
    sameRotation(rolledTurn(track!, 200, end), end); // ends as the board draws it at rest
    expect(length(rolledTurn(track!, 100, end))).toBeCloseTo(1, 12);
    expect(end).not.toEqual(marbleTurn(3, at(0, 2))); // it rolled
  });

  it('the roll turns about the axis square to the path, by one cell over the radius', () => {
    const before = put([[0, 0, 1]]);
    const after = put([[1, 0, 1]]);
    const [track] = slideTracks(before, after, move(0, [0, 0]), false); // east, along +x
    const end = carryTurns(new Map([[at(0, 0), [0, 0, 0, 1]]]), 3, [track!], 0).get(at(1, 0))!;
    const half = 1 / 0.36 / 2;
    sameRotation(end, [0, 0, -Math.sin(half), Math.cos(half)]); // about -z: up × east
  });

  it('a line moving along itself: each marble takes its own turn, read before any is moved', () => {
    const before = put([[-1, 0, 1], [0, 0, 1], [1, 0, 1]]);
    const after = put([[0, 0, 1], [1, 0, 1], [2, 0, 1]]);
    const tracks = slideTracks(before, after, move(0, [-1, 0], [0, 0], [1, 0]), false);
    const turns = carryTurns(new Map(), 3, tracks, 0);
    for (const track of tracks) {
      const [q, r] = track.cell;
      sameRotation(rolledTurn(track, 0, turns.get(at(q, r))!), marbleTurn(3, at(q - 1, r)));
    }
  });

  it('keeps the turn of the marbles that do not move and never changes the turns it is given', () => {
    const before = put([[0, 2, 1], [3, 0, 2]]);
    const after = put([[0, 1, 1], [3, 0, 2]]);
    const tracks = slideTracks(before, after, move(4, [0, 2]), false);
    const kept: Quat = [0, 1, 0, 0];
    const given = new Map([[at(3, 0), kept]]);
    const turns = carryTurns(given, 3, tracks, 4);
    expect(turns.get(at(3, 0))).toBe(kept);
    expect([...given.keys()]).toEqual([at(3, 0)]);
  });
});

describe('inHolder', () => {
  // The holder of an ejected marble turns by `yaw` about the vertical axis: up, y.
  const yawed = (yaw: number, q: Quat): Quat => {
    const [s, c] = [Math.sin(yaw / 2), Math.cos(yaw / 2)];
    const [x, y, z, w] = q;
    return [c * x + s * z, c * y + s * w, c * z - s * x, c * w - s * y];
  };

  it('keeps the marble\'s own turn on the board once its holder is turned (#364)', () => {
    for (const yaw of [0, 1, -2.5, Math.PI]) {
      const own = marbleTurn(3, 20);
      const inside = inHolder(own, yaw);
      expect(length(inside)).toBeCloseTo(1, 12);
      sameRotation(yawed(yaw, inside), own);
    }
  });

  it('is the turn back against the yaw for a marble never turned', () => {
    sameRotation(inHolder([0, 0, 0, 1], 1), [0, -Math.sin(0.5), 0, Math.cos(0.5)]);
  });
});

import { describe, expect, it } from 'vitest';
import { CORE_CODE, DIRECTIONS, VANISHED, axialTo3D, cellIndex, cellsFor, type Axial, type Move } from './board';
import { MARBLE_RADIUS, SLIDE_MS, rollAt, slideAt, slideTracks } from './slide';

const empty = (): number[] => new Array<number>(61).fill(0);
const put = (cells: Array<[number, number, number]>): number[] => {
  const b = empty();
  for (const [q, r, side] of cells) b[cellIndex(q, r)] = side;
  return b;
};
const xz = (q: number, r: number): { x: number; z: number } => {
  const p = axialTo3D(q, r);
  return { x: p.x, z: p.z };
};
const move = (dir: number, ...cells: Axial[]): Move => ({ cells, dir });

describe('slideTracks', () => {
  it('slides one marble from its cell to the next one over 200 ms', () => {
    const before = put([[0, 2, 1]]);
    const after = put([[0, 1, 1]]);
    expect(SLIDE_MS).toBe(200);
    expect(slideTracks(before, after, move(4, [0, 2]), false)).toEqual([
      { cell: [0, 1], from: xz(0, 2), to: xz(0, 1), durationMs: SLIDE_MS },
    ]);
  });

  it('slides every marble of a broadside move, nothing else', () => {
    const before = put([[-2, 2, 1], [-1, 2, 1], [0, 2, 1], [1, 2, 1]]);
    const after = put([[-2, 1, 1], [-1, 1, 1], [0, 1, 1], [1, 2, 1]]);
    const tracks = slideTracks(before, after, move(4, [-2, 2], [-1, 2], [0, 2]), false);
    expect(tracks.map((t) => t.cell)).toEqual([[-2, 1], [-1, 1], [0, 1]]);
  });

  it('slides a pushed core of The Overseer with the pushing line (#635)', () => {
    const before = put([[-1, 1, 1], [0, 1, 1], [1, 1, CORE_CODE]]);
    const after = put([[0, 1, 1], [1, 1, 1], [2, 1, CORE_CODE]]);
    const tracks = slideTracks(before, after, move(0, [-1, 1], [0, 1]), false);
    expect(tracks).toContainEqual({ cell: [2, 1], from: xz(1, 1), to: xz(2, 1), durationMs: SLIDE_MS });
  });

  it('slides the pushed opponent marbles with the pushing line', () => {
    // Black pair on the q = 0 column pushes one White marble NW.
    const before = put([[0, 1, 1], [0, 0, 1], [0, -1, 2]]);
    const after = put([[0, 0, 1], [0, -1, 1], [0, -2, 2]]);
    const tracks = slideTracks(before, after, move(4, [0, 0], [0, 1]), false);
    expect(tracks).toHaveLength(3);
    expect(tracks).toContainEqual({ cell: [0, -2], from: xz(0, -1), to: xz(0, -2), durationMs: SLIDE_MS });
    expect(tracks.map((t) => t.cell)).toEqual(
      expect.arrayContaining([[0, -1], [0, 0], [0, -2]]),
    );
  });

  it('leaves the marble pushed off the board to the ejection animation', () => {
    // Black trio on the q = -2 column pushes two White marbles NW: the last one leaves the board.
    const before = put([[-2, 0, 1], [-2, 1, 1], [-2, 2, 1], [-2, -1, 2], [-2, -2, 2]]);
    const after = put([[-2, -1, 1], [-2, 0, 1], [-2, 1, 1], [-2, -2, 2]]);
    const tracks = slideTracks(before, after, move(4, [-2, 0], [-2, 1], [-2, 2]), false);
    expect(tracks.map((t) => t.cell)).toEqual(
      expect.arrayContaining([[-2, -1], [-2, 0], [-2, 1], [-2, -2]]),
    );
    expect(tracks).toHaveLength(4);
    expect(tracks).toContainEqual({ cell: [-2, -2], from: xz(-2, -1), to: xz(-2, -2), durationMs: SLIDE_MS });
  });

  it('ends the push line at a vanished cell: the marbles beyond the hole stay put', () => {
    // The Hull: (0,-2) is a hole. The Black pair pushes the White marble into it (an ejection),
    // the White pair beyond the hole does not move.
    const before = put([[0, 1, 1], [0, 0, 1], [0, -1, 2], [0, -2, VANISHED], [0, -3, 2], [0, -4, 2]]);
    const after = put([[0, 0, 1], [0, -1, 1], [0, -2, VANISHED], [0, -3, 2], [0, -4, 2]]);
    const tracks = slideTracks(before, after, move(4, [0, 0], [0, 1]), false);
    expect(tracks.map((t) => t.cell)).toEqual([[0, -1], [0, 0]]);
  });

  it('slides on another board given its cells: the battle royale arena (#612)', () => {
    const arena = cellsFor(8);
    const board = (cells: Array<[number, number]>): number[] => {
      const b = new Array<number>(arena.length).fill(0);
      for (const [q, r] of cells) b[cellIndex(q, r, arena)] = 1;
      return b;
    };
    // (0, 8) pushes (0, 7) NW, both beyond the radius 4 board.
    const tracks = slideTracks(board([[0, 8], [0, 7]]), board([[0, 7], [0, 6]]), move(4, [0, 8]), false, arena);
    expect(tracks.map((t) => t.cell)).toEqual([[0, 7], [0, 6]]);
    expect(tracks[0]!.from).toEqual(xz(0, 8));
  });

  it('skips a marble the board after the move does not show at its new cell', () => {
    // A boss special flipped the moved marble after the move: no slide, it just appears.
    const before = put([[0, 2, 1]]);
    const after = put([[0, 1, 2]]);
    expect(slideTracks(before, after, move(4, [0, 2]), false)).toEqual([]);
  });

  it('has zero duration with reduced motion', () => {
    const before = put([[0, 2, 1]]);
    const after = put([[0, 1, 1]]);
    expect(slideTracks(before, after, move(4, [0, 2]), true)).toEqual([
      { cell: [0, 1], from: xz(0, 2), to: xz(0, 1), durationMs: 0 },
    ]);
  });
});

describe('slideAt', () => {
  const track = { cell: [1, 0] as Axial, from: { x: 0, z: 0 }, to: { x: 1, z: 2 }, durationMs: 200 };

  it('starts at the old cell', () => {
    expect(slideAt(track, 0)).toEqual({ x: 0, z: 0 });
  });

  it('eases out: past the middle of the path at half time', () => {
    const p = slideAt(track, 100);
    expect(p.x).toBeCloseTo(0.875);
    expect(p.z).toBeCloseTo(1.75);
  });

  it('stays at the new cell once the duration has passed', () => {
    expect(slideAt(track, 5000)).toEqual({ x: 1, z: 2 });
  });

  it('reduced motion: at the new cell at once', () => {
    expect(slideAt({ ...track, durationMs: 0 }, 0)).toEqual({ x: 1, z: 2 });
  });
});

describe('rollAt', () => {
  // One cell east: the path is 1 long, along +x.
  const east = { cell: [1, 0] as Axial, from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, durationMs: 200 };

  it('has not rolled at the start', () => {
    expect(rollAt(east, 0).angle).toBe(0);
  });

  it('rolls by the distance travelled over the radius: half way at half time', () => {
    // The ease out has gone 0.875 of the path at half time.
    expect(rollAt(east, 100).angle).toBeCloseTo(0.875 / MARBLE_RADIUS);
  });

  it('has rolled one cell over the radius at the end, and no further', () => {
    expect(rollAt(east, 200).angle).toBeCloseTo(1 / MARBLE_RADIUS);
    expect(rollAt(east, 5000).angle).toBeCloseTo(1 / MARBLE_RADIUS);
    expect(rollAt({ ...east, durationMs: 0 }, 0).angle).toBeCloseTo(1 / MARBLE_RADIUS); // reduced motion
  });

  it('turns about the axis on the board plane square to the path, up × path: rolling, not slipping', () => {
    expect(MARBLE_RADIUS).toBe(0.36);
    for (const [dq, dr] of DIRECTIONS) {
      const a = axialTo3D(0, 0);
      const b = axialTo3D(dq, dr);
      const track = { cell: [dq, dr] as Axial, from: { x: a.x, z: a.z }, to: { x: b.x, z: b.z }, durationMs: 200 };
      const [ax, ay, az] = rollAt(track, 100).axis;
      const [px, pz] = [b.x - a.x, b.z - a.z];
      expect(Math.hypot(ax, ay, az)).toBeCloseTo(1); // a unit axis
      expect(ay).toBe(0); // on the board plane
      expect(ax * px + az * pz).toBeCloseTo(0); // square to the path
      // up × path: the contact point does not move. The top of the marble turns toward the path.
      expect(ax).toBeCloseTo(pz / Math.hypot(px, pz));
      expect(az).toBeCloseTo(-px / Math.hypot(px, pz));
    }
  });
});

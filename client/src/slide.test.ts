import { describe, expect, it } from 'vitest';
import { VANISHED, axialTo3D, cellIndex, type Axial, type Move } from './board';
import { SLIDE_MS, slideAt, slideTracks } from './slide';

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

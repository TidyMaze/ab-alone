import { describe, expect, it } from 'vitest';
import { CORE_CODE, DIRECTIONS, VANISHED, axialTo3D, cellIndex, cellsFor, type Axial, type Move } from './board';
import { MARBLE_RADIUS, SLIDE_MS, SQUASH, SQUASH_MS, STAGGER_MS, rollAt, slideAt, slideEndMs, slideTracks, squashAt } from './slide';

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
    expect(tracks).toContainEqual({ cell: [2, 1], from: xz(1, 1), to: xz(2, 1), durationMs: SLIDE_MS - STAGGER_MS, delayMs: STAGGER_MS });
  });

  it('slides the pushed opponent marbles with the pushing line', () => {
    // Black pair on the q = 0 column pushes one White marble NW.
    const before = put([[0, 1, 1], [0, 0, 1], [0, -1, 2]]);
    const after = put([[0, 0, 1], [0, -1, 1], [0, -2, 2]]);
    const tracks = slideTracks(before, after, move(4, [0, 0], [0, 1]), false);
    expect(tracks).toHaveLength(3);
    expect(tracks).toContainEqual({ cell: [0, -2], from: xz(0, -1), to: xz(0, -2), durationMs: SLIDE_MS - STAGGER_MS, delayMs: STAGGER_MS });
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
    expect(tracks).toContainEqual({ cell: [-2, -2], from: xz(-2, -1), to: xz(-2, -2), durationMs: SLIDE_MS - STAGGER_MS, delayMs: STAGGER_MS });
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

describe('the stagger of a pushed chain', () => {
  // Black pair pushes White marbles NW along the q = -2 column; a trio pushes two.
  const line = (pushed: number): ReturnType<typeof slideTracks> => {
    const cells: Array<[number, number, number]> = [[-2, 2, 1], [-2, 1, 1]];
    for (let k = 0; k < pushed; k++) cells.push([-2, 0 - k, 2]);
    const after = cells.map(([q, r, side]): [number, number, number] => [q, r - 1, side]);
    return slideTracks(put(cells), put(after), move(4, [-2, 1], [-2, 2]), false);
  };
  const delayOf = (tracks: ReturnType<typeof line>, cell: Axial): number | undefined => tracks.find((t) => t.cell[0] === cell[0] && t.cell[1] === cell[1])!.delayMs;

  it('is 20 ms a place along the line: about the time the pusher takes to close the gap to the next marble', () => {
    expect(STAGGER_MS).toBe(20);
    // The pusher's ease out cubic covers the 0.28 cell gap between two marbles (spacing 1, diameter 0.72) in about 21 ms.
    expect(1 - (1 - STAGGER_MS / SLIDE_MS) ** 3).toBeCloseTo(0.27, 2);
    expect(MARBLE_RADIUS * 2).toBeCloseTo(0.72);
  });

  it('starts the pushed marbles after the pusher, the moved group at once', () => {
    const tracks = line(2);
    expect(delayOf(tracks, [-2, 0])).toBeUndefined();
    expect(delayOf(tracks, [-2, 1])).toBeUndefined();
    expect(delayOf(tracks, [-2, -1])).toBe(STAGGER_MS); // the first marble pushed
    expect(delayOf(tracks, [-2, -2])).toBe(2 * STAGGER_MS); // the second one
  });

  it('stops at two places, so a long line of cores and marbles never waits long', () => {
    // Black pair, then a White marble, a core, a White marble and a core: four pushed.
    const cells: Array<[number, number, number]> = [[-4, 0, 1], [-3, 0, 1], [-2, 0, 2], [-1, 0, CORE_CODE], [0, 0, 2], [1, 0, CORE_CODE]];
    const after = cells.map(([q, r, side]): [number, number, number] => [q + 1, r, side]);
    const tracks = slideTracks(put(cells), put(after), move(0, [-4, 0], [-3, 0]), false);
    expect(tracks.map((t) => t.delayMs)).toEqual([undefined, undefined, STAGGER_MS, 2 * STAGGER_MS, 2 * STAGGER_MS, 2 * STAGGER_MS]);
  });

  it('shortens the pushed marbles slide so the whole move still ends at 200 ms', () => {
    for (const tracks of [line(1), line(2)]) {
      for (const t of tracks) expect(slideEndMs(t)).toBe(SLIDE_MS);
    }
    expect(slideEndMs({ cell: [0, 0], from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, durationMs: 180, delayMs: 20 })).toBe(200);
    expect(slideEndMs({ cell: [0, 0], from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, durationMs: 200 })).toBe(200);
  });

  it('has no stagger with reduced motion', () => {
    const cells: Array<[number, number, number]> = [[0, 1, 1], [0, 0, 1], [0, -1, 2]];
    const after = cells.map(([q, r, side]): [number, number, number] => [q, r - 1, side]);
    for (const t of slideTracks(put(cells), put(after), move(4, [0, 0], [0, 1]), true)) {
      expect(t.durationMs).toBe(0);
      expect(t.delayMs ?? 0).toBe(0);
    }
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

  it('waits at the old cell for its delay, then eases out over what is left', () => {
    const late = { ...track, delayMs: 20, durationMs: 180 };
    expect(slideAt(late, 0)).toEqual({ x: 0, z: 0 });
    expect(slideAt(late, 20)).toEqual({ x: 0, z: 0 });
    expect(slideAt(late, 20 + 90).x).toBeCloseTo(0.875);
    expect(slideAt(late, 200)).toEqual({ x: 1, z: 2 });
  });
});

describe('squashAt', () => {
  const track = { cell: [1, 0] as Axial, from: { x: 0, z: 0 }, to: { x: 1, z: 2 }, durationMs: 200 };
  const rest = { y: 1, xz: 1 };

  it('lasts 120 ms from the arrival, and is cut short by nothing before or after', () => {
    expect(SQUASH_MS).toBe(120);
    expect(squashAt(track, 0)).toEqual(rest); // still sliding
    expect(squashAt(track, 199)).toEqual(rest);
    expect(squashAt(track, 200)).toEqual(rest); // the arrival: the squash starts from rest
    expect(squashAt(track, 200 + SQUASH_MS)).toEqual(rest);
    expect(squashAt(track, 5000)).toEqual(rest);
  });

  it('squashes first: flatter and wider, the volume kept', () => {
    const s = squashAt(track, 200 + SQUASH_MS / 4);
    expect(s.y).toBeLessThan(1 - SQUASH / 2);
    expect(s.y).toBeGreaterThan(1 - SQUASH);
    expect(s.xz).toBeGreaterThan(1);
    expect(s.y * s.xz * s.xz).toBeCloseTo(1, 9);
  });

  it('then rebounds taller and thinner than at rest, and settles', () => {
    const s = squashAt(track, 200 + (3 * SQUASH_MS) / 4);
    expect(s.y).toBeGreaterThan(1);
    expect(s.y).toBeLessThan(1 + SQUASH / 2);
    expect(s.xz).toBeLessThan(1);
    expect(s.y * s.xz * s.xz).toBeCloseTo(1, 9);
    expect(squashAt(track, 200 + SQUASH_MS / 2).y).toBeCloseTo(1, 9); // the turn between squash and rebound
  });

  it('starts from the arrival of a delayed track, which is the same moment', () => {
    const late = { ...track, delayMs: 20, durationMs: 180 };
    expect(squashAt(late, 200 + SQUASH_MS / 4)).toEqual(squashAt(track, 200 + SQUASH_MS / 4));
  });

  it('is cut under reduced motion: a zero duration never squashes', () => {
    for (const ms of [0, 10, 30, 60, 100]) expect(squashAt({ ...track, durationMs: 0 }, ms)).toEqual(rest);
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

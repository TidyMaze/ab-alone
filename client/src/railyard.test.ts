import { describe, expect, it } from 'vitest';
import { CELLS, axialTo3D, cellIndex, type Axial } from './board';
import { contrastRatio, type RGB } from './contrast';
import {
  APPROACH,
  CHEVRON_COLOR,
  CHEVRON_SHAPE,
  JUMP_MS,
  PASS_MS,
  TRAIN_LENGTH,
  TRAIN_PARTS,
  chevronSpots,
  knockedMarbles,
  parseTrains,
  passedTrains,
  railSpan,
  reachMs,
  trainAt,
  trainText,
  type Train,
} from './railyard';

// The diagonal q + r = 0 run from (4, -4) to (-4, 4), SW: the first train of fight seed 3 (game-design.md 7.8).
const DIAGONAL = [22, 5, 4, -4, -4, 4];
const diagonal = (): Train => parseTrains(DIAGONAL)[0]!;
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** A 61-cell board with `black` and `white` marbles. */
function board(black: Axial[], white: Axial[]): number[] {
  const out = CELLS.map(() => 0);
  for (const c of black) out[cellIndex(...c)] = 1;
  for (const c of white) out[cellIndex(...c)] = 2;
  return out;
}

describe('parseTrains', () => {
  it('splits the records into the line, the turns left, its cells from the entry and its direction', () => {
    expect(parseTrains([])).toEqual([]);
    const [d, row] = parseTrains([...DIAGONAL, 4, 2, -4, 0, 4, 0]);
    expect(d).toMatchObject({ line: 22, left: 5, dir: 3 }); // SW
    expect(d!.cells).toHaveLength(9);
    expect(d!.cells[0]).toEqual([4, -4]);
    expect(d!.cells[8]).toEqual([-4, 4]);
    expect(d!.cells[4]).toEqual([0, 0]);
    expect(row).toMatchObject({ line: 4, left: 2, dir: 0 }); // E
    expect(parseTrains([13, 1, 0, 4, 0, -4])[0]!.dir).toBe(4); // NW
    expect(parseTrains([31, 1, -2, 4, 2, 0])[0]!.cells).toHaveLength(5); // NE, a line of 5
  });

  it('refuses an array that is not whole records', () => {
    expect(() => parseTrains([1, 2, 3])).toThrow('train array length 3 is not a multiple of 6');
  });
});

describe('trainText', () => {
  it('is empty without trains, else the turns left of each train, soonest first', () => {
    expect(trainText([])).toBe('');
    expect(trainText(parseTrains(DIAGONAL))).toBe('Trains pass: 1 in 5 turns');
    const two = parseTrains([...DIAGONAL, 4, 1, -4, 0, 4, 0]);
    expect(trainText(two)).toBe('Trains pass: 1 in 1 turn · 1 in 5 turns');
  });
});

describe('passedTrains', () => {
  it('is the trains on 1 that are no longer on 1 on their line', () => {
    const on1 = parseTrains([22, 1, 4, -4, -4, 4, 4, 3, -4, 0, 4, 0]);
    const after = parseTrains([4, 2, -4, 0, 4, 0]);
    expect(passedTrains(on1, after).map((t) => t.line)).toEqual([22]);
    expect(passedTrains(on1, on1)).toEqual([]); // the fight ended on the move: nothing passed
    expect(passedTrains(on1, parseTrains([22, 5, -4, 4, 4, -4])).map((t) => t.line)).toEqual([22]); // the line again
    expect(passedTrains(parseTrains(DIAGONAL), [])).toEqual([]);
  });
});

describe('knockedMarbles', () => {
  it('is every marble on the line once the move is played, either side, in the order the train meets them', () => {
    const before = board([[-3, 3], [-1, 2]], [[3, -3], [1, 0]]);
    // Black (-1, 2) NE to (0, 1), off the line; White (1, 0) stays off it.
    expect(knockedMarbles(before, { cells: [[-1, 2]], dir: 2 }, diagonal())).toEqual([
      { cell: [3, -3], side: 2, at: 1 },
      { cell: [-3, 3], side: 1, at: 7 },
    ]);
    // Black (-1, 2) NW onto (-1, 1), on the line: it is knocked too.
    expect(knockedMarbles(before, { cells: [[-1, 2]], dir: 4 }, diagonal()).map((k) => k.at)).toEqual([1, 5, 7]);
    // Black (-3, 3) E off the line.
    expect(knockedMarbles(before, { cells: [[-3, 3]], dir: 0 }, diagonal()).map((k) => k.side)).toEqual([2]);
  });

  it('follows a push, and a marble pushed off the board is not on the line', () => {
    // Black (-2, 0) (-1, 0) push White (0, 0) E onto (1, 0); the row is the line.
    const before = board([[-2, 0], [-1, 0]], [[0, 0]]);
    const row = parseTrains([4, 1, -4, 0, 4, 0])[0]!;
    expect(knockedMarbles(before, { cells: [[-2, 0], [-1, 0]], dir: 0 }, row)).toEqual([
      { cell: [-1, 0], side: 1, at: 3 },
      { cell: [0, 0], side: 1, at: 4 },
      { cell: [1, 0], side: 2, at: 5 },
    ]);
    const rim = board([[2, 0], [3, 0]], [[4, 0]]);
    expect(knockedMarbles(rim, { cells: [[2, 0], [3, 0]], dir: 0 }, row).map((k) => k.cell)).toEqual([[3, 0], [4, 0]]);
  });
});

describe('the pass', () => {
  it('runs the train from APPROACH cells before the entry until the whole train is past the exit', () => {
    const t = diagonal();
    const entry = axialTo3D(4, -4);
    const sw = axialTo3D(-1, 1);
    const start = trainAt(t, 0, false);
    expect(start.x).toBeCloseTo(entry.x - APPROACH * sw.x);
    expect(start.z).toBeCloseTo(entry.z - APPROACH * sw.z);
    expect(start.done).toBe(false);
    const end = trainAt(t, PASS_MS, false);
    expect(end.x).toBeCloseTo(entry.x + (8 + APPROACH + TRAIN_LENGTH) * sw.x);
    expect(end.done).toBe(true);
    const mid = trainAt(t, PASS_MS / 2, false);
    expect(mid.x).toBeCloseTo((start.x + end.x) / 2);
    expect(trainAt(t, -50, false).x).toBeCloseTo(start.x);
    expect(trainAt(t, PASS_MS * 2, false).x).toBeCloseTo(end.x);
    expect(start.yaw).toBeCloseTo(-Math.atan2(sw.z, sw.x)); // its model runs along +x
  });

  it('reaches each marble in turn, when its front meets it', () => {
    const t = diagonal();
    const times = [0, 1, 8].map((at) => reachMs(t, at, false));
    expect(times[0]).toBeGreaterThan(0);
    expect(times[1]).toBeGreaterThan(times[0]!);
    expect(times[2]).toBeLessThan(PASS_MS);
    const front = trainAt(t, times[1]!, false);
    const cell = axialTo3D(3, -3);
    expect(Math.hypot(front.x - cell.x, front.z - cell.z)).toBeCloseTo(0.36); // a marble radius short
  });

  it('under reduced motion jumps across at half time, no slide, and knocks every marble at the jump', () => {
    const t = diagonal();
    const start = trainAt(t, 0, true);
    expect(trainAt(t, JUMP_MS / 2 - 1, true)).toEqual(start);
    const end = trainAt(t, JUMP_MS / 2, true);
    expect(end.x).toBeCloseTo(trainAt(t, PASS_MS, false).x);
    expect(end.done).toBe(false);
    expect(trainAt(t, JUMP_MS, true).done).toBe(true);
    expect(reachMs(t, 0, true)).toBe(JUMP_MS / 2);
    expect(reachMs(t, 8, true)).toBe(JUMP_MS / 2);
  });
});

describe('the tell on the board', () => {
  it('puts a chevron on both edges, one cell out, and on every cell of the line, all pointing the way it runs', () => {
    const spots = chevronSpots(diagonal());
    expect(spots).toHaveLength(11);
    expect(spots.filter((s) => s.edge)).toEqual([spots[0], spots[10]]);
    const out = axialTo3D(5, -5);
    expect([spots[0]!.x, spots[0]!.z]).toEqual([out.x, out.z]);
    const past = axialTo3D(-5, 5);
    expect([spots[10]!.x, spots[10]!.z]).toEqual([past.x, past.z]);
    expect(new Set(spots.map((s) => s.yaw))).toEqual(new Set([trainAt(diagonal(), 0, false).yaw]));
  });

  it('lays the rails along the line, APPROACH cells out past both edges', () => {
    const rails = railSpan(diagonal());
    expect([rails.x, rails.z]).toEqual([0, 0]);
    expect(rails.length).toBe(9 + 2 * APPROACH);
    expect(railSpan(parseTrains([4, 1, -4, 0, 4, 0])[0]!).yaw).toBeCloseTo(0);
  });

  it('draws the chevrons in an amber that reads 3:1 on the steel deck and the near-black frame', () => {
    expect(contrastRatio(rgb(CHEVRON_COLOR), rgb(0x4a5258))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(rgb(CHEVRON_COLOR), rgb(0x0b0d0f))).toBeGreaterThanOrEqual(3);
    const xs = CHEVRON_SHAPE.map(([x]) => x);
    expect(Math.max(...xs)).toBeGreaterThan(Math.abs(Math.min(...xs))); // it points +x
  });
});

describe('the freight train model', () => {
  it('is a locomotive and ore wagons, low-poly, its front at x = 0 and the rest behind', () => {
    const ids = TRAIN_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('loco-') && !id.includes('wheel'))).toEqual([
      'loco-chassis',
      'loco-hood',
      'loco-cab',
      'loco-roof',
      'loco-stack',
      'loco-lamp',
    ]);
    expect(TRAIN_PARTS.filter((p) => p.type === 'ore')).toHaveLength(2); // two wagons of ore
    expect(TRAIN_PARTS.filter((p) => p.type === 'wheel')).toHaveLength(14);
    expect(TRAIN_PARTS.length).toBeLessThan(40);
    for (const p of TRAIN_PARTS) {
      const half = p.type === 'box' ? p.size[0]! / 2 : p.size[0]!;
      expect(p.position[0] + half).toBeLessThanOrEqual(0.0001);
      expect(p.position[0] - half).toBeGreaterThanOrEqual(-TRAIN_LENGTH - 0.0001);
      expect(Math.abs(p.position[2])).toBeLessThan(0.5); // one cell wide
    }
  });
});

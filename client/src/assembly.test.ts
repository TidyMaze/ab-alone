import { describe, expect, it } from 'vitest';
import { cellIndex } from './board';
import {
  BLINK_MS,
  RIB_SPACING,
  SLAM_MS,
  beforeBelts,
  beltMoves,
  beltSpan,
  beltText,
  blinkAt,
  chevronSpots,
  counterSpot,
  fellOff,
  isStrikeSlot,
  parseBelts,
  parseCarries,
  plateSpots,
  ribOffsets,
  rollerSpots,
  slamAt,
  struckBy,
  type Belt,
} from './assembly';

// The Assembly Line tell as data (game-design.md section 7.12, #744): the records of the bridge, the pattern, the board
// before the belts and the geometry of the models.

/** The records of `Encounter.belts()`: 5 turns left, the centre belt running toward +q, the others at rest. */
const START = [5, 0, -4, 9, 1, 0, -1, -1, -3, 8, 0, 0, -1, 1, -4, 8, 0, 0, -1];
const centre: Belt = parseBelts(START)!.belts[0]!;

describe('parseBelts', () => {
  it('reads the turns left and one record per belt, the cells from the lowest q', () => {
    const { left, belts } = parseBelts(START)!;
    expect(left).toBe(5);
    expect(belts.map((b) => [b.cells.length, b.dir, b.shift, b.strike])).toEqual([
      [9, 1, 0, -1],
      [8, 0, 0, -1],
      [8, 0, 0, -1],
    ]);
    expect(belts[0]!.cells[0]).toEqual([-4, 0]);
    expect(belts[1]!.cells[0]).toEqual([-3, -1]);
    expect(belts[2]!.cells[7]).toEqual([3, 1]);
  });

  it('is null for a boss with no belts and refuses a record that is cut short', () => {
    expect(parseBelts([])).toBeNull();
    expect(() => parseBelts([5, 0, -4, 9])).toThrow('not 1 plus a multiple of 6');
  });
});

describe('pattern', () => {
  it('alternates plain and strike from the first slot, and scrolls with the belt', () => {
    const at = (len: number, shift: number) => Array.from({ length: len }, (_, i) => isStrikeSlot(len, shift, i));
    expect(at(8, 0)).toEqual([false, true, false, true, false, true, false, true]);
    expect(at(8, 1)).toEqual([true, false, true, false, true, false, true, false]);
    expect(at(9, 1)).toEqual([false, false, true, false, true, false, true, false, true]);
  });

  it('puts a plate on every strike cell, red on the announced one', () => {
    const belt = { ...centre, strike: 3 };
    const plates = plateSpots(belt);
    expect(plates).toHaveLength(4);
    expect(plates.map((p) => p.strike)).toEqual([false, true, false, false]);
    expect(plates[1]!.x).toBe(-1);
  });
});

describe('beltText', () => {
  it('names the turns left before the reversal and the press that strikes next turn', () => {
    expect(beltText(parseBelts(START))).toBe('Belts reverse in 5 turns');
    expect(beltText(parseBelts([1, 0, -4, 9, -1, 0, -1]))).toBe('Belts reverse in 1 turn');
    expect(beltText(parseBelts([2, 0, -4, 9, -1, 0, 3]))).toBe('Belts reverse in 2 turns · press strikes next turn');
    expect(beltText(null)).toBe('');
  });
});

describe('carries', () => {
  // A marble of side 2 fell off the east end, a marble of side 1 was carried (3, 0) to (4, 0), a marble of side 1 was
  // struck at (0, 1) after it was carried from (1, 1).
  const flat = [4, 0, 5, 0, 1, 2, 3, 0, 4, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 2, 1];
  const carries = parseCarries(flat);

  it('reads the records', () => {
    expect(carries.map((c) => c.fate)).toEqual(['fell', 'carried', 'carried', 'struck']);
    expect(carries[0]).toEqual({ from: [4, 0], to: [5, 0], fate: 'fell', side: 2 });
    expect(parseCarries([])).toEqual([]);
    expect(() => parseCarries([1, 2])).toThrow('not a multiple of 6');
  });

  it('puts every marble back on the cell it left, a struck one through its carry', () => {
    const after = Array(61).fill(0);
    after[cellIndex(4, 0)] = 1; // the one carried to (4, 0)
    after[cellIndex(1, 1)] = 0;
    const before = beforeBelts(after, carries);
    expect(before[cellIndex(4, 0)]).toBe(2); // the one that fell stood there
    expect(before[cellIndex(3, 0)]).toBe(1);
    expect(before[cellIndex(1, 1)]).toBe(1); // carried to (0, 1), where the press struck it
    expect(before[cellIndex(0, 1)]).toBe(0);
    expect(before.filter((c) => c !== 0)).toHaveLength(3);
  });

  it('groups the marbles that moved by direction, and lists the ones that fell and the ones struck', () => {
    expect(beltMoves(carries)).toEqual([{ cells: [[4, 0], [3, 0]], dir: 0 }, { cells: [[1, 1]], dir: 1 }]);
    expect(beltMoves([])).toEqual([]);
    expect(fellOff(carries)).toEqual([{ cell: [4, 0], side: 2, dir: 0 }]);
    expect(fellOff(parseCarries([-4, 0, -5, 0, 1, 1]))).toEqual([{ cell: [-4, 0], side: 1, dir: 1 }]);
    expect(struckBy(carries)).toEqual([{ cell: [0, 1], side: 1 }]);
  });
});

describe('geometry', () => {
  it('spans a belt with a roller beyond each end', () => {
    expect(beltSpan(centre)).toEqual({ x: 0, z: 0, length: 10 });
    const [west, east] = rollerSpots(centre);
    expect([west!.x, east!.x]).toEqual([-4.55, 4.55]);
    const upper = beltSpan(parseBelts(START)!.belts[1]!);
    expect([upper.x, upper.z, upper.length]).toEqual([0, -Math.sqrt(3) / 2, 9]);
  });

  it('draws a chevron on every cell of a running belt, pointing the way it runs', () => {
    expect(chevronSpots(centre).map((c) => c.dir)).toEqual(Array(9).fill(0));
    expect(chevronSpots({ ...centre, dir: -1 }).map((c) => c.dir)).toEqual(Array(9).fill(1));
    expect(chevronSpots({ ...centre, dir: 0 })).toEqual([]);
  });

  it('puts the counter past the east end of the centre belt', () => {
    const c = counterSpot(centre);
    expect(c.x).toBeGreaterThan(rollerSpots(centre)[1]!.x);
    expect(c.y).toBeGreaterThan(0.5);
  });
});

describe('animation', () => {
  it('scrolls the ribs the way the belt runs, wrapping, and holds them still at rest or under reduced motion', () => {
    const still = ribOffsets(centre, 0, false);
    expect(still).toHaveLength(20);
    expect(ribOffsets(centre, 1000, true)).toEqual(still);
    expect(ribOffsets({ ...centre, dir: 0 }, 1000, false)).toEqual(still);
    const later = ribOffsets(centre, 1000, false);
    expect(later[0]! - still[0]!).toBeCloseTo(0.5);
    const back = ribOffsets({ ...centre, dir: -1 }, 400, false);
    expect(back.every((x) => x >= -5 && x < 5)).toBe(true);
    expect(back[1]! - still[1]!).toBeCloseTo(-0.2);
    expect(RIB_SPACING).toBe(0.5);
  });

  it('swells the red of an announced slot slowly, and keeps it steady under reduced motion', () => {
    const levels = [0, 0.25, 0.5, 0.75].map((t) => blinkAt(t * BLINK_MS, false));
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(0.55);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
    expect(new Set(levels).size).toBeGreaterThan(2);
    expect(blinkAt(123, true)).toBe(1);
  });

  it('brings the press down onto its plate in a third of the strike and back up, and skips it under reduced motion', () => {
    expect(slamAt(0, false)).toEqual({ y: 1.1, done: false });
    expect(slamAt(SLAM_MS / 3, false).y).toBeCloseTo(0.2);
    expect(slamAt(SLAM_MS * 0.67, false).y).toBeGreaterThan(0.2);
    expect(slamAt(SLAM_MS * 0.67, false).y).toBeLessThan(1.1);
    expect(slamAt(SLAM_MS, false)).toEqual({ y: expect.closeTo(1.1, 5), done: true });
    expect(slamAt(-5, false).done).toBe(false);
    expect(slamAt(10, true)).toEqual({ y: 1.1, done: true });
  });
});

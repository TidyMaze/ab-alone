import { describe, expect, it } from 'vitest';
import { axialTo3D, type Axial } from './board';
import {
  COLLAPSE_MS,
  DROP_HEIGHT,
  DROP_MS,
  DUAL_AZIMUTH,
  DUAL_CELLS,
  DUAL_POLAR,
  ROOMS,
  WALL,
  dropAt,
  dualText,
  parseDual,
  parseReturn,
  roomOf,
  wallAt,
} from './dual';

const distance = (a: Axial, b: Axial): number =>
  (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

describe('The Dual Room board (#947, game-design.md section 7.15)', () => {
  it('holds two rooms of 61 cells, the south one on r >= 0 and the north one on r <= -1', () => {
    expect(DUAL_CELLS).toHaveLength(122);
    for (const [k, centre] of ROOMS.entries()) {
      const room = DUAL_CELLS.filter((c) => roomOf(c) === k);
      expect(room).toHaveLength(61);
      expect(room.every((c) => distance(c, centre) <= 4)).toBe(true);
    }
    expect([roomOf([0, 0]), roomOf([0, -1])]).toEqual([0, 1]);
  });

  it('stands the wall between the two wall rows, across their whole width', () => {
    const south = DUAL_CELLS.filter(([, r]) => r === 0).map(([q, r]) => axialTo3D(q, r));
    const north = DUAL_CELLS.filter(([, r]) => r === -1).map(([q, r]) => axialTo3D(q, r));
    expect(WALL.z).toBeLessThan(Math.min(...south.map((p) => p.z)));
    expect(WALL.z).toBeGreaterThan(Math.max(...north.map((p) => p.z)));
    const xs = [...south, ...north].map((p) => p.x);
    expect(WALL.x - WALL.length / 2).toBeLessThanOrEqual(Math.min(...xs));
    expect(WALL.x + WALL.length / 2).toBeGreaterThanOrEqual(Math.max(...xs));
    expect(WALL.height).toBeGreaterThan(0);
  });

  it('opens the fight looking along the wall, the two rooms side by side', () => {
    expect(DUAL_AZIMUTH).toBeCloseTo(Math.PI / 2);
    // Drawn back as far as the view goes (DIST_MAX 18), the camera stays under the bay's gantry ribs, from y = 12.8.
    expect(18 * Math.cos(DUAL_POLAR)).toBeLessThan(12.8);
  });
});

describe('the bridge records', () => {
  it('reads the wall and the announced return of Encounter.dual(), null for the other bosses', () => {
    expect(parseDual([])).toBeNull();
    expect(parseDual([0, 0, 0, 0])).toEqual({ collapsed: false, coming: null });
    expect(parseDual([0, 2, -1, -1])).toEqual({ collapsed: false, coming: { side: 2, cell: [-1, -1] } });
    expect(parseDual([1, 0, 0, 0])).toEqual({ collapsed: true, coming: null });
  });

  it('reads the marble that landed at the end of the last ply, null when none did', () => {
    expect(parseReturn([])).toBeNull();
    expect(parseReturn([1, -4, 8])).toEqual({ side: 1, cell: [-4, 8] });
  });
});

describe('dualText', () => {
  it('says nothing outside the fight', () => {
    expect(dualText(null, 1)).toBe('');
  });

  it('names whose marble comes back on the mark, and when the wall falls', () => {
    expect(dualText({ collapsed: false, coming: null }, 1)).toBe('Ejected marbles come back in the other room · the wall falls at 5');
    expect(dualText({ collapsed: false, coming: { side: 2, cell: [1, -1] } }, 1)).toBe(
      'Its marble comes back on the mark next turn · the wall falls at 5',
    );
    expect(dualText({ collapsed: false, coming: { side: 1, cell: [1, -1] } }, 1)).toBe(
      'Your marble comes back on the mark next turn · the wall falls at 5',
    );
    expect(dualText({ collapsed: true, coming: { side: 1, cell: [1, -1] } }, 1)).toBe(
      'Your marble comes back on the mark next turn · the wall is down, ejected marbles are gone',
    );
    expect(dualText({ collapsed: true, coming: null }, 1)).toBe('The wall is down, ejected marbles are gone');
  });
});

describe('the animations', () => {
  it('drops a returning marble from DROP_HEIGHT onto its cell in DROP_MS, falling faster and faster', () => {
    expect(dropAt(0, false)).toEqual({ y: DROP_HEIGHT, done: false });
    const half = dropAt(DROP_MS / 2, false);
    expect(half.y).toBeCloseTo(DROP_HEIGHT * 0.75);
    expect(half.done).toBe(false);
    expect(dropAt(DROP_MS, false)).toEqual({ y: 0, done: true });
    expect(dropAt(-5, false).y).toBe(DROP_HEIGHT);
  });

  it('reduced motion: the returning marble is on its cell at once, no fall', () => {
    expect(dropAt(0, true)).toEqual({ y: 0, done: true });
  });

  it('sinks the wall into the floor and fades it in COLLAPSE_MS', () => {
    expect(wallAt(0, false)).toEqual({ y: 0, opacity: 1, done: false });
    const half = wallAt(COLLAPSE_MS / 2, false);
    expect(half.y).toBeCloseTo(-WALL.height / 2);
    expect(half.opacity).toBeCloseTo(0.5);
    expect(wallAt(COLLAPSE_MS, false)).toEqual({ y: -WALL.height, opacity: 0, done: true });
  });

  it('reduced motion: the wall is gone at once', () => {
    expect(wallAt(0, true)).toEqual({ y: -WALL.height, opacity: 0, done: true });
  });
});

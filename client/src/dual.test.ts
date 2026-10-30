import { describe, expect, it } from 'vitest';
import { BLOOD_MS } from './blood';
import { axialTo3D, type Axial } from './board';
import {
  BRIDGE,
  BRIDGE_HEIGHT,
  BRIDGE_MS,
  DROP_HEIGHT,
  DROP_MS,
  DUAL_AZIMUTH,
  DUAL_CELLS,
  DUAL_POLAR,
  ROOMS,
  bridgeAt,
  dropAt,
  dualText,
  parseDual,
  parseReturn,
  roomOf,
} from './dual';

const distance = (a: Axial, b: Axial): number =>
  (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

describe('The Dual Room board (#947, #955, game-design.md section 7.15)', () => {
  it('holds two rooms of 37 cells, the south one on r >= 1 and the north one on r <= -1, the void between', () => {
    expect(DUAL_CELLS).toHaveLength(74);
    for (const [k, centre] of ROOMS.entries()) {
      const room = DUAL_CELLS.filter((c) => roomOf(c) === k);
      expect(room).toHaveLength(37);
      expect(room.every((c) => distance(c, centre) <= 3)).toBe(true);
    }
    expect(DUAL_CELLS.some(([, r]) => r === 0)).toBe(false);
    expect([roomOf([0, 1]), roomOf([0, -1])]).toEqual([0, 1]);
  });

  it('fills the void with the bridge, the row of 5 cells between the two facing edges of 4', () => {
    expect(BRIDGE).toEqual([[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]]);
    for (const edge of [1, -1]) {
      const facing = DUAL_CELLS.filter(([, r]) => r === edge);
      expect(facing).toHaveLength(4);
      for (const [q, r] of BRIDGE) expect(facing.some((c) => distance(c, [q, r]) === 1)).toBe(true);
    }
  });

  it('opens the fight looking across the void, the two rooms side by side', () => {
    expect(DUAL_AZIMUTH).toBeCloseTo(Math.PI / 2);
    // Drawn back as far as the view goes (DIST_MAX 18), the camera stays under the bay's gantry ribs, from y = 12.8.
    expect(18 * Math.cos(DUAL_POLAR)).toBeLessThan(12.8);
    expect(axialTo3D(...ROOMS[0]!).x).toBe(axialTo3D(...ROOMS[1]!).x);
  });
});

describe('the bridge records', () => {
  it('reads the bridge and the announced return of Encounter.dual(), null for the other bosses', () => {
    expect(parseDual([])).toBeNull();
    expect(parseDual([0, 0, 0, 0])).toEqual({ bridged: false, coming: null });
    expect(parseDual([0, 2, 0, -2])).toEqual({ bridged: false, coming: { side: 2, cell: [0, -2] } });
    expect(parseDual([1, 0, 0, 0])).toEqual({ bridged: true, coming: null });
  });

  it('reads the marble that landed at the end of the last ply, null when none did', () => {
    expect(parseReturn([])).toBeNull();
    expect(parseReturn([1, -3, 7])).toEqual({ side: 1, cell: [-3, 7] });
  });
});

describe('dualText', () => {
  it('says nothing outside the fight', () => {
    expect(dualText(null, 1)).toBe('');
  });

  it('names whose marble comes back on the mark, and when the bridge comes', () => {
    expect(dualText({ bridged: false, coming: null }, 1)).toBe('Ejected marbles come back in the other room · the bridge comes at 5');
    expect(dualText({ bridged: false, coming: { side: 2, cell: [0, -1] } }, 1)).toBe(
      'Its marble comes back on the mark next turn · the bridge comes at 5',
    );
    expect(dualText({ bridged: false, coming: { side: 1, cell: [0, -1] } }, 1)).toBe(
      'Your marble comes back on the mark next turn · the bridge comes at 5',
    );
    expect(dualText({ bridged: true, coming: { side: 1, cell: [0, -1] } }, 1)).toBe(
      'Your marble comes back on the mark next turn · the bridge is up, ejected marbles are gone',
    );
    expect(dualText({ bridged: true, coming: null }, 1)).toBe('The bridge is up, ejected marbles are gone');
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

  it("lowers the bridge's cells from BRIDGE_HEIGHT into the void in BRIDGE_MS, slowing as they land", () => {
    expect(bridgeAt(0, false)).toEqual({ y: BRIDGE_HEIGHT, done: false });
    const half = bridgeAt(BRIDGE_MS / 2, false);
    expect(half.y).toBeCloseTo(BRIDGE_HEIGHT * 0.25);
    expect(half.done).toBe(false);
    expect(bridgeAt(BRIDGE_MS, false)).toEqual({ y: 0, done: true });
  });

  it('holds the bridge up before it starts, and lowers it longer than the splash of the ejection that brings it', () => {
    expect(bridgeAt(-Infinity, false)).toEqual({ y: BRIDGE_HEIGHT, done: false });
    expect(BRIDGE_MS).toBeGreaterThan(BLOOD_MS);
  });

  it('reduced motion: the bridge is in place at once', () => {
    expect(bridgeAt(0, true)).toEqual({ y: 0, done: true });
  });
});

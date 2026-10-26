import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, CELLS, VANISHED, axialTo3D, cellIndex } from './board';
import { FRAME, RIM_LIGHT, frameShape, rimHalves, rimLight } from './frame';

const DISC = 0.46; // the cell disc radius of main.ts
const ring = ([q, r]: readonly [number, number]): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const start = (): number[] => CELLS.map(() => 0);
// Distance from the centre to the farthest side of a hexagon whose sides face 30, 90, 150... degrees.
const reach = (p: { x: number; z: number }): number =>
  Math.max(...[0, 1, 2, 3, 4, 5].map((k) => p.x * Math.cos(Math.PI / 6 + (k * Math.PI) / 3) + p.z * Math.sin(Math.PI / 6 + (k * Math.PI) / 3)));
const apothem = (corners: { x: number; z: number }[]): number => Math.hypot(corners[0]!.x, corners[0]!.z) * (Math.sqrt(3) / 2);

describe('frameShape (world.md section 6)', () => {
  it('frames the standard board: a hexagon with a corner on each corner cell, no hole', () => {
    const shape = frameShape(start());
    expect(shape.radius).toBe(4);
    expect(shape.holes).toEqual([]);
    expect(shape.inner).toHaveLength(6);
    const corner = axialTo3D(4, 0);
    expect(shape.inner[0]!.z).toBeCloseTo(0);
    expect(shape.inner[0]!.x).toBeGreaterThan(corner.x);
    expect(apothem(shape.inner)).toBeCloseTo(4 * (Math.sqrt(3) / 2) + FRAME.margin);
    for (const p of shape.inner) expect(Math.hypot(p.x, p.z)).toBeCloseTo(Math.hypot(shape.inner[0]!.x, 0));
  });

  it('covers no cell: every disc sits inside the rim with a gap', () => {
    const { inner } = frameShape(start());
    for (const [q, r] of CELLS) expect(reach(axialTo3D(q, r)) + DISC).toBeLessThan(apothem(inner));
  });

  it('the rim is a band of FRAME.rim around the plate', () => {
    const { inner, outer } = frameShape(start());
    expect(outer).toHaveLength(6);
    expect(apothem(outer)).toBeCloseTo(apothem(inner) + FRAME.rim);
  });

  it('The Choir plays on radius 3: its frame is that size and the vanished outer ring is outside it', () => {
    const board = CELLS.map((c) => (ring(c) === 4 ? VANISHED : 0));
    const shape = frameShape(board);
    expect(shape.radius).toBe(3);
    expect(shape.holes).toEqual([]);
    expect(apothem(shape.inner)).toBeCloseTo(3 * (Math.sqrt(3) / 2) + FRAME.margin);
  });

  it('The Ballast Mind plays on radius 5 (#564): its frame is that size, a hole on each of its six pillars', () => {
    const pillars = [[1, 1], [-1, 2], [-2, 1], [-1, -1], [1, -2], [2, -1]];
    const board = BOARD_CELLS.map(([q, r]) => (pillars.some(([pq, pr]) => pq === q && pr === r) ? VANISHED : 0));
    const shape = frameShape(board);
    expect(shape.radius).toBe(5);
    expect(shape.holes).toHaveLength(6);
    expect(apothem(shape.inner)).toBeCloseTo(5 * (Math.sqrt(3) / 2) + FRAME.margin);
    for (const [q, r] of BOARD_CELLS) expect(reach(axialTo3D(q, r)) + DISC).toBeLessThan(apothem(shape.inner));
  });

  it('a vanished cell of The Hull is a hole in the plate, inside the rim', () => {
    const board = start();
    board[cellIndex(4, -1)] = VANISHED;
    const shape = frameShape(board);
    expect(shape.radius).toBe(4);
    const centre = axialTo3D(4, -1);
    expect(shape.holes).toEqual([{ x: centre.x, z: centre.z }]);
    expect(FRAME.hole).toBeGreaterThan(DISC);
    expect(reach(centre) + FRAME.hole).toBeLessThan(apothem(shape.inner));
  });
});

describe('the rim lights for the side to move (#300, world.md section 6 rule 2)', () => {
  it('splits the rim at the two corners on the x axis: the near half at side 1\'s end (+z), the far half at side 2\'s', () => {
    const shape = frameShape(start());
    const { near, far } = rimHalves(shape);
    expect(near).toEqual([...shape.outer.slice(0, 4), ...shape.inner.slice(0, 4).reverse()]);
    expect(far).toEqual([shape.outer[3], shape.outer[4], shape.outer[5], shape.outer[0], shape.inner[0], shape.inner[5], shape.inner[4], shape.inner[3]]);
    for (const p of near) expect(p.z).toBeGreaterThanOrEqual(-1e-9);
    for (const p of far) expect(p.z).toBeLessThanOrEqual(1e-9);
    expect(axialTo3D(0, 4).z).toBeGreaterThan(0); // side 1 starts on r = 4: the near end
  });

  it('lights the half at the end of the side to move, in its colour: cyan glass, sodium shell', () => {
    expect(rimLight(0, 1, 1)).toEqual({ end: 'near', color: RIM_LIGHT.glass });
    expect(rimLight(0, 1, 2)).toEqual({ end: 'near', color: RIM_LIGHT.shell });
    expect(rimLight(0, 2, 2)).toEqual({ end: 'far', color: RIM_LIGHT.glass });
    expect(rimLight(0, 2, 1)).toEqual({ end: 'far', color: RIM_LIGHT.shell });
    expect([RIM_LIGHT.glass, RIM_LIGHT.shell]).toEqual([0x7fd6e8, 0xd9822b]); // the palette of world.md section 5
  });

  it('lights nothing once the game is over: nobody is to move', () => {
    for (const status of [1, 2, 3]) expect(rimLight(status, 1, 1)).toBeNull();
  });
});

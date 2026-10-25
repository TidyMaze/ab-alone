import { describe, expect, it } from 'vitest';
import { relativeLuminance } from './contrast';
import { PROPS, ROOM_SURFACE, propList } from './room';

describe('room surface and props (#470)', () => {
  it('room surface is positioned just below the frame plate', () => {
    expect(ROOM_SURFACE.y).toBeLessThanOrEqual(-0.3);
    expect(ROOM_SURFACE.width).toBeGreaterThanOrEqual(20);
    expect(ROOM_SURFACE.depth).toBeGreaterThanOrEqual(20);
  });

  it('room surface color is low-key, darker than the board steel', () => {
    const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    expect(relativeLuminance(hex(ROOM_SURFACE.color))).toBeLessThan(relativeLuminance(hex(0x4a5258)));
  });

  it('every prop sits outside the board perimeter so no cell or rim notch is obscured', () => {
    for (const p of PROPS) {
      const dist = Math.hypot(p.position[0], p.position[2]);
      expect(dist, `prop ${p.id} distance from center`).toBeGreaterThan(5.0);
    }
  });

  it('propList includes props on high tier, drops them on low tier for performance', () => {
    expect(propList('high').length).toBeGreaterThan(0);
    expect(propList('low').length).toBe(0);
  });
});

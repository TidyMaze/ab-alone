import { describe, expect, it } from 'vitest';
import { relativeLuminance } from './contrast';
import {
  ROOM_SURFACE,
  pedestalParts,
  spaceshipArchitecture,
  spaceshipLights,
} from './room';

describe('spaceship interior architecture and room deck (#478)', () => {
  it('room surface is positioned just below the frame plate', () => {
    expect(ROOM_SURFACE.y).toBeLessThanOrEqual(-0.3);
    expect(ROOM_SURFACE.width).toBeGreaterThanOrEqual(20);
    expect(ROOM_SURFACE.depth).toBeGreaterThanOrEqual(20);
  });

  it('room surface color is low-key, darker than the board steel', () => {
    const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    expect(relativeLuminance(hex(ROOM_SURFACE.color))).toBeLessThan(relativeLuminance(hex(0x4a5258)));
  });

  it('pedestal sits under the board without exceeding board elevation', () => {
    const parts = pedestalParts();
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) {
      expect(p.position[1]).toBeLessThanOrEqual(-0.05);
    }
  });

  it('all architectural elements sit outside the play volume or below the board', () => {
    for (const tier of ['high', 'low'] as const) {
      const elements = spaceshipArchitecture(tier);
      expect(elements.length).toBeGreaterThan(0);
      for (const el of elements) {
        const radius = Math.hypot(el.position[0], el.position[2]);
        const belowBoard = el.position[1] <= -0.05;
        const outsideBoard = radius >= 4.9;
        expect(belowBoard || outsideBoard, `element ${el.id} bounds check`).toBe(true);
      }
    }
  });

  it('architectural materials are low-key and preserve contrast against board steel', () => {
    const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const elements = spaceshipArchitecture('high');
    for (const el of elements) {
      // Accent parts like emergency lintel can have controlled hazard tones, but structural steel stays dark
      if (el.id !== 'hazard-lintel') {
        expect(relativeLuminance(hex(el.color))).toBeLessThan(relativeLuminance(hex(0x4a5258)));
      }
    }
  });

  it('tier switches detail: high tier has full conduits and detail, low tier streamlines', () => {
    const high = spaceshipArchitecture('high');
    const low = spaceshipArchitecture('low');
    expect(high.length).toBeGreaterThan(low.length);
    expect(high.some((e) => e.id.includes('conduit'))).toBe(true);
    expect(low.some((e) => e.id.includes('conduit'))).toBe(false);
  });

  it('spaceshipLights provides emergency sodium strip and cold rim backlight', () => {
    const lights = spaceshipLights();
    expect(lights.emergency.color).toBe(0xd9822b);
    expect(lights.rim.color).toBe(0x7fd6e8);
    expect(lights.emergency.intensity).toBeGreaterThan(0);
    expect(lights.rim.intensity).toBeGreaterThan(0);
  });
});

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

  it('pedestal sits under the board without exceeding board elevation (#769)', () => {
    const parts = pedestalParts();
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) {
      expect(p.position[1]).toBeLessThanOrEqual(-0.05);
      const halfHeight = p.type === 'cylinder' ? (p.size[2] as number) / 2 : (p.size[1] as number) / 2;
      expect(p.position[1] + halfHeight).toBeLessThanOrEqual(-0.1);
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

  it('outer walls are placed at radius >= 20 so camera orbit up to DIST_MAX (18) never crashes into them', () => {
    const elements = spaceshipArchitecture('low');
    const wallElements = elements.filter((el) => el.id.includes('wall') || el.id.includes('column') || el.id.includes('bulkhead'));
    expect(wallElements.length).toBeGreaterThan(0);
    for (const el of wallElements) {
      const radius = Math.hypot(el.position[0], el.position[2]);
      expect(radius, `wall element ${el.id} radius`).toBeGreaterThanOrEqual(20);
    }
  });

  it('surrounds the board in 360 degrees with architecture in all four quadrants', () => {
    const elements = spaceshipArchitecture('low');
    const hasNorth = elements.some((el) => el.position[2] < -15);
    const hasSouth = elements.some((el) => el.position[2] > 15);
    const hasWest = elements.some((el) => el.position[0] < -15);
    const hasEast = elements.some((el) => el.position[0] > 15);
    expect(hasNorth, 'has north wall').toBe(true);
    expect(hasSouth, 'has south wall').toBe(true);
    expect(hasWest, 'has west wall').toBe(true);
    expect(hasEast, 'has east wall').toBe(true);
  });

  it('provides corner neon modules in all four quadrants outside the board radius', () => {
    const elements = spaceshipArchitecture('low');
    const cornerElements = elements.filter((el) => el.id.startsWith('corner-'));
    expect(cornerElements.length).toBeGreaterThanOrEqual(4);
    for (const el of cornerElements) {
      const radius = Math.hypot(el.position[0], el.position[2]);
      expect(radius, `corner element ${el.id} radius`).toBeGreaterThan(20.0);
    }
  });

  it('the log recorder of the deck (#517) sits flush on the SW deck, in both tiers', () => {
    for (const tier of ['high', 'low'] as const) {
      const parts = spaceshipArchitecture(tier);
      const recorder = parts.find((el) => el.id === 'log-recorder')!;
      expect(recorder.type).toBe('box');
      expect(recorder.position[1]).toBeLessThanOrEqual(-0.2);
    }
  });

  it('architectural materials are low-key and preserve contrast against board steel', () => {
    const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const elements = spaceshipArchitecture('high');
    for (const el of elements) {
      // Accent parts like emergency lintels can have controlled hazard tones, but structural steel stays dark
      if (!el.id.includes('hazard')) {
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

  it('overhead structural bulkhead arches frame the ceiling at radius >= 20', () => {
    for (const tier of ['high', 'low'] as const) {
      const parts = spaceshipArchitecture(tier);
      const north = parts.find((p) => p.id === 'bulkhead-arch-north')!;
      const south = parts.find((p) => p.id === 'bulkhead-arch-south')!;
      expect(north.type).toBe('box');
      expect(south.type).toBe('box');
      expect(north.position[1]).toBe(15.0);
      expect(south.position[1]).toBe(15.0);
      expect(Math.hypot(north.position[0], north.position[2])).toBeGreaterThanOrEqual(20);
      expect(Math.hypot(south.position[0], south.position[2])).toBeGreaterThanOrEqual(20);
    }
  });

  it('spaceshipLights gives the neon tubes the deck\'s emergency colour and the cold rim colour', () => {
    expect(spaceshipLights()).toEqual({ emergency: 0xd9822b, rim: 0x7fd6e8 });
    expect(spaceshipLights('furnace').emergency).toBe(0xff4d00);
    expect(spaceshipLights('bridge').emergency).toBe(0x00cec9);
    expect(spaceshipLights('chapel').emergency).toBe(0x6c5ce7);
    expect(spaceshipLights('cargo').emergency).toBe(0x7fd6e8);
  });
});

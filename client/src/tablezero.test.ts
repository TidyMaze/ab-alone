import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, SUN, addSun, hexPrism, tableZeroActive, windowStrip, windowStripGeometry } from './tablezero';

const triangles = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.attributes.position!.count) / 3;

describe('Table Zero is the scene of a 1v1 game only', () => {
  const none = { hub: false, fight: false, royale: false, run: false };
  it('is on for a plain game', () => expect(tableZeroActive(none)).toBe(true));
  it.each(['hub', 'fight', 'royale', 'run'] as const)('is off in %s', (k) => expect(tableZeroActive({ ...none, [k]: true })).toBe(false));
});

describe('the shared kit', () => {
  it('keeps the eight colours of the art direction', () => {
    expect(Object.keys(PALETTE)).toHaveLength(8);
    expect(PALETTE.dust).toBe(0x877d65);
  });
  it('adds the Open world sun: one hemisphere, one directional, no point light', () => {
    const scene = new THREE.Scene();
    const lights = addSun(scene);
    expect(lights.map((l) => l.type).sort()).toEqual(['DirectionalLight', 'HemisphereLight']);
    expect(lights.find((l) => l.type === 'DirectionalLight')!.color.getHex()).toBe(SUN.sun);
    expect(scene.children).toHaveLength(2);
  });
  it('makes a hex prism of 24 triangles, one colour per vertex', () => {
    const g = hexPrism(0.5, 0.2, 0x446957);
    expect(triangles(g)).toBe(24);
    expect(g.attributes.color!.count).toBe(g.attributes.position!.count);
  });
  it('lays the window strip: deterministic, stepped, under 300 triangles, one geometry', () => {
    expect(windowStrip()).toEqual(windowStrip());
    const columns = windowStrip();
    expect(new Set(columns.map((c) => c.height)).size).toBeGreaterThan(2);
    const g = windowStripGeometry();
    expect(triangles(g)).toBe(columns.length * 18);
    expect(triangles(g)).toBeLessThanOrEqual(300);
    expect(g.attributes.color!.count).toBe(g.attributes.position!.count);
  });
});

import { describe, expect, it } from 'vitest';
import { KICK_MS, KICK_PX, KICK_ZOOM, REST, kickAt, unkick } from './kick';

describe('kickAt', () => {
  it('lasts at most 250 ms, and is at rest before it starts and after it ends', () => {
    expect(KICK_MS).toBeLessThanOrEqual(250);
    expect(kickAt(-1, false)).toBe(REST);
    expect(kickAt(KICK_MS, false)).toBe(REST);
    expect(kickAt(5000, false)).toBe(REST);
    expect(REST).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it('starts from rest, so the picture never jumps', () => {
    const k = kickAt(0, false);
    expect(k.zoom).toBe(1);
    expect(k.x).toBeCloseTo(0, 9);
    expect(k.y).toBeCloseTo(0, 9);
  });

  it('punches the zoom in, by at most 2 %, then back to rest', () => {
    expect(KICK_ZOOM).toBe(0.02);
    const zooms = Array.from({ length: KICK_MS }, (_, ms) => kickAt(ms, false).zoom);
    expect(Math.max(...zooms)).toBeGreaterThan(1 + KICK_ZOOM * 0.9);
    expect(Math.max(...zooms)).toBeLessThanOrEqual(1 + KICK_ZOOM);
    expect(Math.min(...zooms)).toBeGreaterThanOrEqual(1);
    expect(zooms.indexOf(Math.max(...zooms))).toBeLessThan(KICK_MS / 2); // the punch is fast, the way back is slower
    expect(zooms[KICK_MS - 1]).toBeLessThan(1.001);
  });

  it('shakes the picture by a few pixels, less and less, on both axes', () => {
    expect(KICK_PX).toBe(4);
    const kicks = Array.from({ length: KICK_MS }, (_, ms) => kickAt(ms, false));
    const peak = (from: number, to: number, axis: 'x' | 'y'): number => Math.max(...kicks.slice(from, to).map((k) => Math.abs(k[axis])));
    for (const axis of ['x', 'y'] as const) {
      expect(peak(0, KICK_MS, axis)).toBeGreaterThan(1);
      expect(peak(0, KICK_MS, axis)).toBeLessThanOrEqual(KICK_PX);
      expect(peak(KICK_MS / 2, KICK_MS, axis)).toBeLessThan(peak(0, KICK_MS / 2, axis)); // it dies away
    }
    expect(kicks.some((k) => k.x > 0) && kicks.some((k) => k.x < 0)).toBe(true); // it shakes, it does not slide
  });

  it('is cut under reduced motion', () => {
    for (const ms of [0, 30, 60, 120, 200]) expect(kickAt(ms, true)).toBe(REST);
  });
});

describe('unkick', () => {
  const [w, h] = [400, 300];

  it('leaves a point alone at rest', () => {
    expect(unkick(REST, 123, 45, w, h)).toEqual({ x: 123, y: 45 });
  });

  it('gives the point of the resting picture that the kicked picture shows under (x, y)', () => {
    const kick = { zoom: 1.02, x: 3, y: -2 };
    // The kicked picture shows the resting point p at the centre plus the zoom times its offset from the centre, plus the shake.
    for (const p of [{ x: 100, y: 50 }, { x: 200, y: 150 }, { x: 399, y: 299 }, { x: 0, y: 0 }]) {
      const shown = { x: w / 2 + kick.zoom * (p.x - w / 2) + kick.x, y: h / 2 + kick.zoom * (p.y - h / 2) + kick.y };
      const back = unkick(kick, shown.x, shown.y, w, h);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('puts a click within a few pixels of the point it would hit at rest, even at the corner of the window', () => {
    const worst = Math.max(...Array.from({ length: KICK_MS }, (_, ms) => {
      const back = unkick(kickAt(ms, false), w, h, w, h);
      return Math.hypot(back.x - w, back.y - h);
    }));
    expect(worst).toBeLessThan(KICK_PX + KICK_ZOOM * Math.hypot(w, h) / 2 + 1);
  });
});

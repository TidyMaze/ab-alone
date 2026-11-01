import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  FOAM_GAIN,
  FOAM_MS,
  motionUniforms,
  RIPPLE_ALPHA,
  RIPPLE_MS,
  RIPPLE_REACH,
  RIPPLES,
  RipplePool,
  rippleAt,
  SWAY_DEG,
  SWAY_MS,
  swayLean,
  writeRipples,
} from './openworldmotion';

describe('the water and prop motion of the Open world (#1101, #1102, docs/specs/openworld-animation.md sections 3 and 4)', () => {
  it('keeps the spec numbers: 4 ripples of 600 ms to 1.2 cells at 0.5, foam 3200 ms at 0.25, sway 4000 ms at 2 degrees', () => {
    expect([RIPPLES, RIPPLE_MS, RIPPLE_REACH, RIPPLE_ALPHA]).toEqual([4, 600, 1.2, 0.5]);
    expect([FOAM_MS, FOAM_GAIN]).toEqual([3200, 0.25]);
    expect([SWAY_MS, SWAY_DEG]).toEqual([4000, 2]);
  });

  it('grows a ripple from nothing to 1.2 cells while it fades 0.5 to 0, then it is gone', () => {
    expect(rippleAt(0, 1)).toEqual({ radius: 0, alpha: RIPPLE_ALPHA });
    const mid = rippleAt(RIPPLE_MS / 2, 1)!;
    expect(mid.radius).toBeGreaterThan(RIPPLE_REACH / 2); // ease-out: past half the way at half the time
    expect(mid.alpha).toBeLessThan(RIPPLE_ALPHA);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(rippleAt(RIPPLE_MS, 1)).toBeNull();
    expect(rippleAt(-5, 1)).toBeNull();
  });

  it('stretches a ripple with the slow check', () => {
    expect(rippleAt(RIPPLE_MS, 2)).not.toBeNull();
    expect(rippleAt(RIPPLE_MS * 2, 2)).toBeNull();
  });

  it('leans a tree up to 2 degrees either way, on a loop of 4000 ms, a different way by phase', () => {
    const max = Math.tan((2 * Math.PI) / 180);
    expect(swayLean(0, 0)).toBeCloseTo(0);
    expect(swayLean(SWAY_MS / 4, 0)).toBeCloseTo(max);
    expect(swayLean(SWAY_MS, 0)).toBeCloseTo(swayLean(0, 0));
    expect(swayLean(0, Math.PI / 2)).toBeCloseTo(max);
  });

  describe('the ripple pool', () => {
    it('holds 4: a fifth replaces the oldest, and the pool never grows', () => {
      const pool = new RipplePool();
      expect(pool.cap).toBe(4);
      for (let k = 0; k < 4; k++) pool.spawn(k, 0, k * 10);
      expect(pool.live(40)).toBe(4);
      pool.spawn(9, 0, 50);
      expect(pool.live(50)).toBe(4);
      const xs = Array.from({ length: 4 }, (_, i) => pool.x[i]);
      expect(xs).toContain(9);
      expect(xs).not.toContain(0); // the oldest left
    });

    it('lets a ripple go after 600 ms, and clears at once', () => {
      const pool = new RipplePool();
      pool.spawn(1, 2, 100);
      expect(pool.live(699)).toBe(1);
      expect(pool.live(700)).toBe(0);
      pool.spawn(1, 2, 800);
      pool.clear();
      expect(pool.live(810)).toBe(0);
    });

    it('writes the pool to the uniforms: the place and the start of each, a start far in the past for a free slot', () => {
      const pool = new RipplePool();
      const u = motionUniforms();
      writeRipples(pool, u);
      for (const r of u.ripples) expect(r.value.z).toBeLessThan(-1e8);
      pool.spawn(3, 4, 120);
      writeRipples(pool, u);
      expect(u.ripples[0]!.value.toArray()).toEqual([3, 4, 120, 0]);
    });
  });

  it('builds one set of uniforms, off until a frame sets them', () => {
    const u = motionUniforms();
    expect(u.ripples).toHaveLength(4);
    expect([u.time.value, u.foam.value, u.sway.value]).toEqual([0, 0, 0]);
    expect(u.span.value).toBe(RIPPLE_MS);
    expect(u.ripples[0]!.value).toBeInstanceOf(THREE.Vector4);
  });
});

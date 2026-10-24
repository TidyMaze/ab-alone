import { describe, expect, it } from 'vitest';
import {
  DIST_MAX,
  DIST_MIN,
  DRAG_THRESHOLD_PX,
  FOV,
  POLAR_MAX,
  POLAR_MIN,
  clampDistance,
  clampPolar,
  framing,
  isDrag,
  orbit,
  pinchScale,
  resetView,
  viewPosition,
  wheelScale,
  zoom,
} from './camera';

describe('clamping', () => {
  it('keeps the polar angle above the board, never at the pole or the horizon', () => {
    expect(POLAR_MIN).toBeGreaterThan(0);
    expect(POLAR_MAX).toBeLessThan(Math.PI / 2);
    expect(clampPolar(-1)).toBe(POLAR_MIN);
    expect(clampPolar(3)).toBe(POLAR_MAX);
    expect(clampPolar(0.7)).toBe(0.7);
  });

  it('keeps the distance between the min and the max', () => {
    expect(clampDistance(0.1)).toBe(DIST_MIN);
    expect(clampDistance(1000)).toBe(DIST_MAX);
    expect(clampDistance(10)).toBe(10);
  });
});

describe('click versus drag', () => {
  it('a movement within the threshold is a click, beyond it a drag', () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(isDrag(0, -(DRAG_THRESHOLD_PX + 1))).toBe(true);
    expect(isDrag(DRAG_THRESHOLD_PX, DRAG_THRESHOLD_PX)).toBe(true); // the diagonal is longer
  });
});

describe('reset target', () => {
  it('is the default camera position (0, 11, 8) looking at the board centre', () => {
    const p = viewPosition(resetView());
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(11);
    expect(p.z).toBeCloseTo(8);
  });

  it('returns a fresh object each time', () => {
    const a = resetView();
    a.azimuth = 2;
    expect(resetView().azimuth).toBe(0);
  });

  it('is inside the limits', () => {
    const v = resetView();
    expect(clampPolar(v.polar)).toBe(v.polar);
    expect(clampDistance(v.distance)).toBe(v.distance);
  });
});

describe('orbit', () => {
  it('a horizontal drag turns around the board, a vertical one tilts, within the limits', () => {
    const v = orbit(resetView(), 100, 0);
    expect(v.azimuth).toBeLessThan(0);
    expect(v.polar).toBe(resetView().polar);
    expect(orbit(resetView(), 0, 100).polar).toBeLessThan(resetView().polar);
    expect(orbit(resetView(), 0, 1e6).polar).toBe(POLAR_MIN);
    expect(orbit(resetView(), 0, -1e6).polar).toBe(POLAR_MAX);
  });

  it('keeps the distance and never puts the camera under the board', () => {
    const v = orbit(resetView(), 37, -1e6);
    expect(v.distance).toBe(resetView().distance);
    expect(viewPosition(v).y).toBeGreaterThan(0);
  });
});

describe('zoom', () => {
  it('scales the distance within the limits', () => {
    expect(zoom(resetView(), 0.5).distance).toBeCloseTo(resetView().distance * 0.5);
    expect(zoom(resetView(), 1e-6).distance).toBe(DIST_MIN);
    expect(zoom(resetView(), 1e6).distance).toBe(DIST_MAX);
  });

  it('the wheel scrolled down zooms out, up zooms in, no scroll changes nothing', () => {
    expect(wheelScale(100)).toBeGreaterThan(1);
    expect(wheelScale(-100)).toBeLessThan(1);
    expect(wheelScale(0)).toBe(1);
  });

  it('fingers moving apart zoom in, together zoom out, a zero span is ignored', () => {
    expect(pinchScale(100, 200)).toBe(0.5);
    expect(pinchScale(200, 100)).toBe(2);
    expect(pinchScale(100, 0)).toBe(1);
  });
});

describe('viewPosition', () => {
  it('turns a quarter around the board with azimuth pi/2', () => {
    const p = viewPosition({ azimuth: Math.PI / 2, polar: Math.PI / 4, distance: 10 });
    expect(p.x).toBeCloseTo(10 * Math.SQRT1_2);
    expect(p.y).toBeCloseTo(10 * Math.SQRT1_2);
    expect(p.z).toBeCloseTo(0);
  });
});

// The horizontal half-angle tangent seen by a camera with this vertical field of view and window.
const halfWidth = (fov: number, width: number, height: number) => Math.tan((fov * Math.PI) / 360) * (width / height);

describe('framing, bug #227', () => {
  it('a window at least as wide as tall keeps the default view', () => {
    expect(framing(1280, 720)).toEqual({ fov: FOV, shift: 0 });
    expect(framing(812, 375)).toEqual({ fov: FOV, shift: 0 });
    expect(framing(600, 600)).toEqual({ fov: FOV, shift: 0 });
  });

  it('a window taller than wide sees as wide as a square one, so the whole board fits its width', () => {
    const square = halfWidth(FOV, 1, 1);
    for (const [w, h] of [
      [375, 812],
      [768, 1024],
      [599, 600],
    ] as const) {
      const { fov } = framing(w, h);
      expect(fov).toBeGreaterThan(FOV);
      expect(halfWidth(fov, w, h)).toBeCloseTo(square, 9);
    }
    expect(framing(599, 600).fov).toBeCloseTo(FOV, 0); // no jump at the square
  });

  it('a window taller than wide moves the board down by a quarter of the spare height, for the HUD and buttons', () => {
    expect(framing(375, 812).shift).toBe((812 - 375) / 4);
    expect(framing(768, 1024).shift).toBe(64);
  });
});

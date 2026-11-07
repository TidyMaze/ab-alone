import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { axialTo3D, CELLS } from './board';
import { framing, viewPosition, type View } from './camera';
import { ZOOM_MIN_MARBLE, boardZoomOn, zoomView } from './boardzoom';

// A marble's width in px: 0.92 of the cell spacing (the disc of the board), projected through the camera of a window.
function screenOf(view: View, width: number, height: number) {
  const camera = new THREE.PerspectiveCamera(framing(width, height), width / height, 0.1, 100);
  const eye = viewPosition(view);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return (q: number, r: number) => {
    const p = axialTo3D(q, r);
    const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  };
}
const widths = (view: View, width: number, height: number) => {
  const at = screenOf(view, width, height);
  return CELLS.map(([q, r]) => {
    const a = at(q, r);
    const b = at(q + 1, r);
    const w = 0.92 * Math.hypot(b.x - a.x, b.y - a.y);
    return { q, r, w, left: a.x - w / 2, right: a.x + w / 2, top: a.y - w / 2, bottom: a.y + w / 2 };
  });
};

describe('the closer view of a phone held upright (#1567)', () => {
  it.each([
    [390, 844],
    [360, 800],
  ])('shows all 61 cells at %ix%i, every marble at least 34 px wide', (width, height) => {
    const all = widths(zoomView(width, height), width, height);
    expect(all).toHaveLength(61);
    expect(ZOOM_MIN_MARBLE).toBe(34);
    expect(Math.min(...all.map((c) => c.w))).toBeGreaterThanOrEqual(ZOOM_MIN_MARBLE);
    for (const c of all) {
      expect(c.left, `cell ${c.q},${c.r}`).toBeGreaterThanOrEqual(0);
      expect(c.right, `cell ${c.q},${c.r}`).toBeLessThanOrEqual(width);
      expect(c.top, `cell ${c.q},${c.r}`).toBeGreaterThanOrEqual(0);
      expect(c.bottom, `cell ${c.q},${c.r}`).toBeLessThanOrEqual(height);
    }
  });

  it('looks straight down the board from the front, and leaves a band for the plate and the dock', () => {
    const view = zoomView(390, 844);
    expect(view.azimuth).toBe(0);
    expect(view.polar).toBeLessThan(0.3);
    const all = widths(view, 390, 844);
    expect(Math.min(...all.map((c) => c.top))).toBeGreaterThan(150); // under the HUD plate
    expect(Math.max(...all.map((c) => c.bottom))).toBeLessThan(700); // over the dock
  });
});

describe('when the closer view applies', () => {
  it('only when it is on and the window is a phone held upright', () => {
    expect(boardZoomOn(true, 390, 844)).toBe(true);
    expect(boardZoomOn(false, 390, 844)).toBe(false);
    expect(boardZoomOn(true, 844, 390)).toBe(false);
    expect(boardZoomOn(true, 1000, 1200)).toBe(false);
  });
});

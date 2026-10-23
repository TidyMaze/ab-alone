// Orbit camera around the board centre: pure view maths, the pointer wiring lives in main.ts.

export interface View {
  azimuth: number; // radians around the vertical axis, 0 looks from +z
  polar: number; // radians from the vertical axis, 0 straight above the board
  distance: number; // from the board centre
}

export const POLAR_MIN = 0.15;
export const POLAR_MAX = 1.4; // under pi/2: the camera never goes below the board plane
export const DIST_MIN = 6;
export const DIST_MAX = 18; // the fog starts at 16.5, farther and the far rim fades out
export const DRAG_THRESHOLD_PX = 5;
const RAD_PER_PX = 0.006;
const WHEEL_RATE = 0.001;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clampPolar = (a: number): number => clamp(a, POLAR_MIN, POLAR_MAX);
export const clampDistance = (d: number): number => clamp(d, DIST_MIN, DIST_MAX);

// A pointer that moved farther than the threshold since it went down is dragging, not clicking.
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;

// The default view: the camera at (0, 11, 8) looking at the board centre.
export const resetView = (): View => ({
  azimuth: 0,
  polar: Math.atan2(8, 11),
  distance: Math.hypot(11, 8),
});

export const orbit = (v: View, dx: number, dy: number): View => ({
  ...v,
  azimuth: v.azimuth - dx * RAD_PER_PX,
  polar: clampPolar(v.polar - dy * RAD_PER_PX),
});

export const zoom = (v: View, scale: number): View => ({ ...v, distance: clampDistance(v.distance * scale) });

export const wheelScale = (deltaY: number): number => Math.exp(deltaY * WHEEL_RATE);

// Fingers moving apart (span grows) bring the camera closer.
export const pinchScale = (prevSpan: number, span: number): number => (span > 0 ? prevSpan / span : 1);

export const viewPosition = (v: View): { x: number; y: number; z: number } => ({
  x: v.distance * Math.sin(v.polar) * Math.sin(v.azimuth),
  y: v.distance * Math.cos(v.polar),
  z: v.distance * Math.sin(v.polar) * Math.cos(v.azimuth),
});

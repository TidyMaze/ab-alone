// Orbit camera around the board centre: pure view maths, the pointer wiring lives in main.ts.

export interface View {
  azimuth: number; // radians around the vertical axis, 0 looks from +z
  polar: number; // radians from the vertical axis, 0 straight above the board
  distance: number; // from the board centre
}

export const POLAR_MIN = 0.15;
export const POLAR_MAX = 1.4; // under pi/2: the camera never goes below the board plane
export const DIST_MIN = 6;
export const DIST_MAX = 18; // the fog follows the zoom (quality.ts), so the limit is only the view size
export const DRAG_THRESHOLD_PX = 5;
export const FOV = 40; // vertical field of view in degrees, for a window at least as wide as tall
const RAD_PER_PX = 0.006;
const WHEEL_RATE = 0.001;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clampPolar = (a: number): number => clamp(a, POLAR_MIN, POLAR_MAX);
export const clampDistance = (d: number): number => clamp(d, DIST_MIN, DIST_MAX);

// The vertical field of view in degrees and how far down the picture is moved, in pixels, for a window.
// A window taller than wide keeps the horizontal view of a square one, so the whole board fits the width
// of a phone held upright, and the board sits lower to leave the top to the HUD and the buttons (#227).
export function framing(width: number, height: number): { fov: number; shift: number } {
  if (width >= height) return { fov: FOV, shift: 0 };
  const half = Math.tan((FOV * Math.PI) / 360) * (height / width);
  return { fov: (360 / Math.PI) * Math.atan(half), shift: (height - width) / 4 };
}

// A pointer that moved farther than the threshold since it went down is dragging, not clicking.
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;

// The default view: the camera at (0, 11, 8) looking at the board centre, scaled with radius.
export const resetView = (radius = 4): View => ({
  azimuth: 0,
  polar: Math.atan2(8, 11),
  distance: (radius / 4) * Math.hypot(11, 8),
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

// The terminal reader (#512): the camera that reads a flat screen stands in front of its centre, along its normal, as
// close as fits the whole screen and a margin around it, in both the height and the width of the view.
export const SCREEN_MARGIN = 1.1;
type Vec3 = { x: number; y: number; z: number };
export function screenView(centre: Vec3, normal: Vec3, width: number, height: number, fov: number, aspect: number): Vec3 {
  const half = Math.tan((fov * Math.PI) / 360);
  const d = SCREEN_MARGIN * Math.max(height / 2 / half, width / 2 / (half * aspect));
  return { x: centre.x + normal.x * d, y: centre.y + normal.y * d, z: centre.z + normal.z * d };
}

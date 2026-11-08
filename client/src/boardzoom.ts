// The closer view of the board on a phone held upright (#1567): one tap, kept per device. The camera looks almost straight
// down the board, so the near and the far rows are about as wide as the middle one, and is drawn as close as keeps all 61
// cells on the window. The rim of the frame may be cropped; no cell is.
import { CELLS, axialTo3D } from './board';
import { fitView, resetView, DIST_MIN, type View } from './camera';

export const ZOOM_MIN_MARBLE = 34; // px, the narrowest marble of the closer view at 390x844 and 360x800
export const ZOOM_POLAR = 0.15; // radians from the vertical
export const ZOOM_MAX_WIDTH = 600; // a phone, not a tablet held upright

// The cells' discs, at the height of their marbles.
const POINTS = CELLS.flatMap(([q, r]) => {
  const { x, z } = axialTo3D(q, r);
  return [-0.46, 0.46].flatMap((dx) => [-0.46, 0.46].map((dz) => ({ x: x + dx, y: 0, z: z + dz })));
});

/** Whether the closer view is shown: it is on, and the window is a phone held upright. */
export const boardZoomOn = (on: boolean, width: number, height: number): boolean => on && width < height && width <= ZOOM_MAX_WIDTH;

/** The closest camera, in front of the board, that holds all 61 cells on a window of this size. */
export const zoomView = (width: number, height: number): View => fitView({ ...resetView(), polar: ZOOM_POLAR, distance: DIST_MIN }, POINTS, width, height);

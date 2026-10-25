// The steel frame the cells sit on (docs/specs/world.md section 6): a plate under the cells, a rim around them.
// Pure outline maths on the board plane (x, z), in cell spacings; main.ts extrudes the meshes.
import { CELLS, VANISHED, axialTo3D } from './board';

export const FRAME = {
  margin: 0.55, // from the outer cell centres to the plate edge, where the rim starts: a disc is 0.46 wide
  rim: 0.25, // the rim's width
  hole: 0.48, // the hole a vanished cell leaves in the plate, wider than its disc
};

export interface Point {
  x: number;
  z: number;
}

export interface FrameShape {
  radius: number; // the farthest ring that still has a cell
  inner: Point[]; // the plate's edge, the rim's inner edge
  outer: Point[]; // the rim's outer edge
  holes: Point[]; // the centres of the vanished cells inside the frame
}

const ring = ([q, r]: readonly [number, number]): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

// A hexagon around the centre whose sides are `apothem` away, a corner on each corner cell.
const hexagon = (apothem: number): Point[] =>
  [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (k * Math.PI) / 3;
    const corner = apothem / (Math.sqrt(3) / 2);
    return { x: corner * Math.cos(a), z: corner * Math.sin(a) };
  });

/** The frame of a board: as big as its cells (The Choir plays on radius 3), with a hole for each vanished cell. */
export function frameShape(board: ArrayLike<number>): FrameShape {
  const radius = CELLS.reduce((max, c, i) => (board[i] === VANISHED ? max : Math.max(max, ring(c))), 0);
  const edge = radius * (Math.sqrt(3) / 2) + FRAME.margin;
  const holes = CELLS.filter((c, i) => board[i] === VANISHED && ring(c) <= radius).map(([q, r]) => {
    const p = axialTo3D(q, r);
    return { x: p.x, z: p.z };
  });
  return { radius, inner: hexagon(edge), outer: hexagon(edge + FRAME.rim), holes };
}

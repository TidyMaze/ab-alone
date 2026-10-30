// The steel frame the cells sit on (docs/specs/world.md section 6): a plate under the cells, a rim around them.
// Pure outline maths on the board plane (x, z), in cell spacings; main.ts extrudes the meshes.
import { BOARD_CELLS, VANISHED, axialTo3D, cellIndex } from './board';
import { BRIDGE, ROOMS } from './dual';

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

// Where the lines through a-b and c-d cross.
const cross = (a: Point, b: Point, c: Point, d: Point): Point => {
  const [ux, uz, vx, vz] = [b.x - a.x, b.z - a.z, d.x - c.x, d.z - c.z];
  const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / (ux * vz - uz * vx);
  return { x: a.x + t * ux, z: a.z + t * uz };
};

/** The outline round The Dual Room's two rooms and the void between them (#947, #955), `edge` away from the outer cell
 * centres: each room's hexagon, joined by a band across the void as long as the bridge's row. It starts at the band's
 * east end and runs round the south room first, so its first half is the south room's. */
export function dualOutline(edge: number): Point[] {
  const [south, north] = ROOMS.map(([q, r]) => {
    const c = axialTo3D(q, r);
    return hexagon(3 * (Math.sqrt(3) / 2) + edge).map((p) => ({ x: p.x + c.x, z: p.z + c.z }));
  }) as [Point[], Point[]];
  const end = 2 + edge; // the band's ends, past the bridge's end cells (2, 0) and (-2, 0)
  const band = (a: Point, b: Point, z: number): Point => cross(a, b, { x: 0, z }, { x: 1, z });
  return [
    { x: end, z: 0 },
    { x: end, z: edge },
    band(south[5]!, south[0]!, edge),
    ...south.slice(0, 4),
    band(south[3]!, south[4]!, edge),
    { x: -end, z: edge },
    { x: -end, z: 0 },
    { x: -end, z: -edge },
    band(north[2]!, north[3]!, -edge),
    ...north.slice(3),
    north[0]!,
    band(north[0]!, north[1]!, -edge),
    { x: end, z: -edge },
  ];
}

/** The frame of a board: as big as its cells (The Ballast Mind plays on radius 5), with a hole for each
 * vanished cell. A board whose cells reach past ring 5 is The Dual Room's: one plate round its two rooms, a hole for each
 * cell of the void until the bridge fills it. */
export function frameShape(board: ArrayLike<number>): FrameShape {
  const cells = BOARD_CELLS.slice(0, board.length);
  const radius = cells.reduce((max, c, i) => (board[i] === VANISHED ? max : Math.max(max, ring(c))), 0);
  const centre = ([q, r]: readonly [number, number]): Point => {
    const p = axialTo3D(q, r);
    return { x: p.x, z: p.z };
  };
  if (radius > 5) {
    const holes = BRIDGE.filter(([q, r]) => board[cellIndex(q, r)] === VANISHED).map(centre);
    return { radius, inner: dualOutline(FRAME.margin), outer: dualOutline(FRAME.margin + FRAME.rim), holes };
  }
  const edge = radius * (Math.sqrt(3) / 2) + FRAME.margin;
  const holes = cells.filter((c, i) => board[i] === VANISHED && ring(c) <= radius).map(centre);
  return { radius, inner: hexagon(edge), outer: hexagon(edge + FRAME.rim), holes };
}

/** The rim's two halves, split at the corners on the x axis: `near` at side 1's end (+z, where it starts), `far` at
 * side 2's. Each is the outline of a band of half the outline (three hexagon sides), so the turn reads by place, not
 * colour alone (#300). The Dual Room's outline splits the same way, the south room near. */
export function rimHalves({ inner, outer }: FrameShape): { near: Point[]; far: Point[] } {
  const n = outer.length;
  const band = (ks: number[]): Point[] => [...ks.map((k) => outer[k]!), ...[...ks].reverse().map((k) => inner[k]!)];
  const half = Array.from({ length: n / 2 + 1 }, (_, k) => k);
  return { near: band(half), far: band(half.map((k) => (k + n / 2) % n)) };
}

/** The lights of the rim (world.md section 5): the player's cold cyan for the glass, sodium orange for the shell. */
export const RIM_LIGHT = { glass: 0x7fd6e8, shell: 0xd9822b };

/** The half of the rim that lights and its colour: the end of the side to move, in that side's colour (world.md
 * section 6 rule 2). Nothing once the game is over (`status` not 0): nobody is to move. */
export function rimLight(status: number, side: number, glass: number): { end: 'near' | 'far'; color: number } | null {
  if (status !== 0) return null;
  return { end: side === 1 ? 'near' : 'far', color: side === glass ? RIM_LIGHT.glass : RIM_LIGHT.shell };
}

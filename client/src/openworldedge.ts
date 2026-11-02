// The edge of an Open world ground cell (#1138): the top of each hex prism gets a thin band along its six edges, a soft dark seam on
// land so the cells read as tidy tiles, a soft light line on water. It is a colour node of the ground's material (no texture, no
// extra mesh, no extra draw call): the band is computed from the prism's own position, before the instance moves it.
import * as THREE from 'three/webgpu';
import { abs, attribute, float, fwidth, materialColor, max, positionLocal, smoothstep, step, vec2, vec3 } from 'three/tsl';

/** The radius of a ground prism (a hex of side 0.56 tiles the grid of spacing 1 with a thin gap) and its apothem. */
export const HEX_RADIUS = 0.56;
export const HEX_APOTHEM = HEX_RADIUS * Math.cos(Math.PI / 6);
/** The width of the band along an edge, in world units. */
export const EDGE_WIDTH = 0.07;
/** How much the band changes the cell's colour: a share of it taken away on land, added on water. */
export const EDGE_GAIN = { land: -0.22, water: 0.5 };

/** The edges of a `CylinderGeometry` prism of six sides have their normals at 30, 90 and 150 degrees from +z. */
const NORMALS = [0, 1, 2].map((k) => [Math.sin(Math.PI / 6 + (k * Math.PI) / 3), Math.cos(Math.PI / 6 + (k * Math.PI) / 3)] as const);

/** The distance from the point `(x, z)` of a prism's top to the nearest edge of its hex (the plain form of the shader's maths). */
export const edgeDistance = (x: number, z: number): number => HEX_APOTHEM - Math.max(...NORMALS.map(([nx, nz]) => Math.abs(x * nx + z * nz)));

/** The band fades out between these widths on screen, in pixels: at 1 px or less it beats against the pixel grid (moire, #1347). */
export const FADE_FROM_PX = 0.75;
export const FADE_TO_PX = 2;

/** The share of the band kept when it is `widthPx` pixels wide on screen (the plain form of the shader's maths). */
export const edgeFade = (widthPx: number): number => {
  const t = Math.min(1, Math.max(0, (widthPx - FADE_FROM_PX) / (FADE_TO_PX - FADE_FROM_PX)));
  return t * t * (3 - 2 * t);
};

/** The share a prism's radius grows by at the widest zoom: 2 % past the radius 1 / sqrt(3) of a hex that tiles the grid of spacing 1 with no gap,
 * so neighbours overlap a hair and no crack is left at a corner. The gap shows as dark dots that shimmer once under a pixel (#1347). */
export const GAP_FILL = (1.02 / Math.sqrt(3)) / HEX_RADIUS - 1;
/** The zoom the gap starts to close at, and the zoom it is closed at. */
export const GAP_FROM_ZOOM = 1.8;
export const GAP_TO_ZOOM = 3;

/** The share the prisms' radius grows by at `zoom` (the plain form of the `widen` uniform): 0 at the close view, `GAP_FILL` from `GAP_TO_ZOOM`. */
export const gapFill = (zoom: number): number => {
  const t = Math.min(1, Math.max(0, (zoom - GAP_FROM_ZOOM) / (GAP_TO_ZOOM - GAP_FROM_ZOOM)));
  return GAP_FILL * t * t * (3 - 2 * t);
};

/** A ground material: white until an instance colours it (the colour comes per cell), with the edge band of `gain` on the top face and
 * the `emissiveNode` given in place of the plain emissive colour. */
export function edgeMaterial(look: { emissive: number; roughness: number; gain: number; emissiveNode?: THREE.Node; positionNode?: THREE.Node; widen?: THREE.UniformNode<'float', number> }): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, emissive: look.emissive, roughness: look.roughness });
  const position = attribute('position', 'vec3');
  const flat = vec2(position.x, position.z);
  const across = NORMALS.map(([nx, nz]) => abs(flat.dot(vec2(nx, nz))));
  const distance = float(HEX_APOTHEM).sub(max(max(across[0]!, across[1]!), across[2]!));
  const band = float(1).sub(smoothstep(0, EDGE_WIDTH, distance));
  const pixel = fwidth(distance).max(1e-6); // the world length of a pixel across the edge: a wide zoom thins the band under it
  const fade = smoothstep(FADE_FROM_PX, FADE_TO_PX, float(EDGE_WIDTH).div(pixel));
  const top = step(0.5, attribute('normal', 'vec3').y); // the sides of the column keep their colour
  material.colorNode = materialColor.mul(float(1).add(band.mul(top).mul(fade).mul(look.gain)));
  if (look.emissiveNode) material.emissiveNode = look.emissiveNode; // the water's foam and ripples (#1101)
  // The desert's shimmer (#1104) and the widening of the prisms (#1347). The position node reads the position after the instance moved it:
  // the corner is pushed out from the cell's centre by its own local position, not scaled from the world's origin.
  if (look.widen) {
    const moved = (look.positionNode ?? positionLocal) as typeof positionLocal;
    material.positionNode = moved.add(vec3(attribute('position', 'vec3').x, 0, attribute('position', 'vec3').z).mul(look.widen));
  } else if (look.positionNode) material.positionNode = look.positionNode;
  return material;
}

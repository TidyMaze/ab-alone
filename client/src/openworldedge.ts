// The edge of an Open world ground cell (#1138): the top of each hex prism gets a thin band along its six edges, a soft dark seam on
// land so the cells read as tidy tiles, a soft light line on water. It is a colour node of the ground's material (no texture, no
// extra mesh, no extra draw call): the band is computed from the prism's own position, before the instance moves it.
import * as THREE from 'three/webgpu';
import { abs, attribute, float, materialColor, max, smoothstep, step, vec2 } from 'three/tsl';

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

/** A ground material: white until an instance colours it (the colour comes per cell), with the edge band of `gain` on the top face and
 * the `emissiveNode` given in place of the plain emissive colour. */
export function edgeMaterial(look: { emissive: number; roughness: number; gain: number; emissiveNode?: THREE.Node; positionNode?: THREE.Node }): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, emissive: look.emissive, roughness: look.roughness });
  const position = attribute('position', 'vec3');
  const flat = vec2(position.x, position.z);
  const across = NORMALS.map(([nx, nz]) => abs(flat.dot(vec2(nx, nz))));
  const distance = float(HEX_APOTHEM).sub(max(max(across[0]!, across[1]!), across[2]!));
  const band = float(1).sub(smoothstep(0, EDGE_WIDTH, distance));
  const top = step(0.5, attribute('normal', 'vec3').y); // the sides of the column keep their colour
  material.colorNode = materialColor.mul(float(1).add(band.mul(top).mul(look.gain)));
  if (look.emissiveNode) material.emissiveNode = look.emissiveNode; // the water's foam and ripples (#1101)
  if (look.positionNode) material.positionNode = look.positionNode; // the desert's shimmer (#1104)
  return material;
}

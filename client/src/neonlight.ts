import * as THREE from 'three/webgpu';

/** The power and reach of each light of a tube, tuned live with ?lights. */
export const TUBE_POWER = 1.5;
export const TUBE_REACH = 8;
/** One light every this many metres along a tube at most. */
export const TUBE_SPACING = 2.5;

/**
 * Real light the shape of a glowing tube: a row of short-reach point lights along its length, in its colour, all named
 * after the tube so ?lights gives the row one slider. A neon tube shines all round, and so do they. A row costs little
 * once the renderer only adds, at each pixel, the lights that reach it (ClusteredLighting, main.ts): 4x cheaper than a
 * rect light per tube, which reaches every pixel. WebGL, without it, gets the same row: the same light everywhere (#882).
 */
export function tubeLights(tube: THREE.Mesh): THREE.PointLight[] {
  tube.geometry.computeBoundingBox();
  const size = tube.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(tube.scale).toArray();
  const length = Math.max(...size);
  const along = new THREE.Vector3().setComponent(size.indexOf(length), 1).applyQuaternion(tube.quaternion);
  const count = Math.max(1, Math.ceil(length / TUBE_SPACING));
  return Array.from({ length: count }, (_, i) => {
    const light = new THREE.PointLight((tube.material as THREE.MeshStandardMaterial).emissive, TUBE_POWER, TUBE_REACH);
    light.name = `${tube.name} light`;
    light.position.copy(tube.position).addScaledVector(along, ((i + 0.5) / count - 0.5) * length);
    return light;
  });
}

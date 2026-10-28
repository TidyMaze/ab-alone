import * as THREE from 'three/webgpu';
import { RectAreaLightTexturesLib } from 'three/examples/jsm/lights/RectAreaLightTexturesLib.js';

/** The power of a tube's light, tuned live with ?lights. */
export const TUBE_POWER = 4;
/** Closer than this to the board's axis, a tube is a bar round the pedestal: it shines outward, on the floor. */
const PEDESTAL = 6;

let ltc = false; // the rect lights' lookup tables, set once for the renderer

/**
 * A real light the shape of a glowing tube: a rect light as long and wide as its box, in its colour, at its place. A
 * rect light shines on one side only: a tube on a wall or the gantry faces the board, a bar round the pedestal faces out.
 */
export function tubeLight(tube: THREE.Mesh, intensity = TUBE_POWER): THREE.RectAreaLight {
  if (!ltc) {
    THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
    ltc = true;
  }
  tube.geometry.computeBoundingBox();
  const size = tube.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(tube.scale);
  const light = new THREE.RectAreaLight((tube.material as THREE.MeshStandardMaterial).emissive, intensity, size.x, size.y);
  light.name = `${tube.name} light`;
  const { x, y, z } = light.position.copy(tube.position);
  light.lookAt(Math.hypot(x, z) < PEDESTAL ? new THREE.Vector3(x * 2, y, z * 2) : new THREE.Vector3(0, 0, 0));
  return light;
}

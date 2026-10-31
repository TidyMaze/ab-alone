// The refined room's objects (#1138): the lights, the wall, the lit strips, the hazard stripe and the crates, made from the data
// of roomrefined.ts and roomdecor.ts. main.ts adds them to the props and disposes the meshes with the next look.
import * as THREE from 'three/webgpu';
import type { Deck } from './deck';
import { FILL, roomRig } from './roomrefined';
import { STEEL, WALL, cornerCrates, hazardStripe, wallStrips } from './roomdecor';

/** What the refined room adds to the props: its objects, and the meshes main.ts disposes with the next look. */
export function buildRefinedRoom(deck: Deck, boss: boolean): { objects: THREE.Object3D[]; meshes: THREE.Mesh[] } {
  const lights = roomRig(boss).map((l) => {
    const light = new THREE.PointLight(l.color, l.power, l.reach);
    light.name = l.name;
    light.position.set(...l.position);
    return light;
  });
  const fill = Object.assign(new THREE.HemisphereLight(FILL.sky, FILL.ground, FILL.intensity), { name: 'fill' });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL.width, WALL.height), new THREE.MeshStandardMaterial({ color: STEEL.wall, roughness: 0.8 }));
  wall.name = 'wall';
  wall.position.set(0, WALL.y, WALL.z);
  const parts = [...wallStrips(deck), hazardStripe(), ...cornerCrates()].map((p) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...p.size),
      new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7, ...(p.emissive ? { emissive: p.emissive, emissiveIntensity: 3 } : {}) }),
    );
    mesh.name = p.id;
    mesh.position.set(...p.position);
    mesh.rotation.set(...p.rotation);
    return mesh;
  });
  const meshes = [wall, ...parts];
  return { objects: [...lights, fill, ...meshes], meshes };
}

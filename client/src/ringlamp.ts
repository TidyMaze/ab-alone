import * as THREE from 'three/webgpu';
import { TUBE_SPACING } from './neonlight';

/** The ring lamp hung over the board (#879): wider than the board, high enough to see the board through its hole. */
export const RING = { radius: 6.5, y: 12.5, ceiling: 15.5, tube: 0.2, face: 0.3, power: 1.5, reach: 16 };

/**
 * A suspended ring luminaire: a matte black shell, its lower face glowing white, hung by 3 thin cables. Its light is a
 * ring of point lights on the face, all named `ring-lamp light` so ?lights gives them one slider; the meshes are the
 * caller's to add to the scene and to dispose. One light every TUBE_SPACING round it, on WebGL too (#882).
 */
export function ringLamp(): { meshes: THREE.Mesh[]; lights: THREE.PointLight[] } {
  const shell = new THREE.Mesh(
    new THREE.TorusGeometry(RING.radius, RING.tube, 8, 64).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.8, metalness: 0.2 }),
  );
  shell.name = 'ring-lamp';
  shell.position.y = RING.y;
  const face = new THREE.Mesh(
    new THREE.RingGeometry(RING.radius - RING.face, RING.radius + RING.face, 64).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
  );
  face.name = 'ring-lamp face';
  face.position.y = RING.y - RING.tube - 0.01;
  const length = RING.ceiling - RING.y;
  const at = (i: number, n: number): [number, number] => [Math.cos((2 * Math.PI * i) / n) * RING.radius, Math.sin((2 * Math.PI * i) / n) * RING.radius];
  const cables = [0, 1, 2].map((i) => {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, length), new THREE.MeshStandardMaterial({ color: 0x101010 }));
    cable.name = 'ring-lamp cable';
    const [x, z] = at(i, 3);
    cable.position.set(x, RING.y + length / 2, z);
    return cable;
  });
  const count = Math.ceil((2 * Math.PI * RING.radius) / TUBE_SPACING);
  const lights = Array.from({ length: count }, (_, i) => {
    const light = new THREE.PointLight(0xffffff, RING.power, RING.reach);
    light.name = 'ring-lamp light';
    const [x, z] = at(i, count);
    light.position.set(x, face.position.y - 0.1, z);
    return light;
  });
  return { meshes: [shell, face, ...cables], lights };
}

import * as THREE from 'three/webgpu';

/** The layer of the cell discs: the raycaster tests it for picking, the camera never draws it. */
export const CELL_LAYER = 1;

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Draws a set of cell discs, each holding its bevel as its first child, as two instanced meshes beside them (#885): two
 * draw calls instead of two per disc, the third of a phone's frame. The discs stay where they are for picking and for the
 * code that hides, turns or sinks them, on a layer the camera skips; just before drawing, each instance takes its disc's
 * place, a hidden disc at scale 0.
 */
export function instanceCells(discs: THREE.Mesh[], parent: THREE.Object3D): THREE.InstancedMesh[] {
  const bevels = discs.map((disc) => disc.children[0] as THREE.Mesh);
  const drawn = [discs[0]!, bevels[0]!].map((m) => {
    const mesh = new THREE.InstancedMesh(m.geometry, m.material, discs.length);
    mesh.frustumCulled = false; // the board is always in view, and its bounds would change with every sinking cell
    return mesh;
  });
  const [drawnDiscs, drawnBevels] = drawn as [THREE.InstancedMesh, THREE.InstancedMesh];
  const bevel = new THREE.Matrix4();
  drawnDiscs.onBeforeRender = () => {
    discs.forEach((disc, i) => {
      disc.updateMatrix();
      bevels[i]!.updateMatrix();
      drawnDiscs.setMatrixAt(i, disc.visible ? disc.matrix : HIDDEN);
      drawnBevels.setMatrixAt(i, disc.visible ? bevel.multiplyMatrices(disc.matrix, bevels[i]!.matrix) : HIDDEN);
    });
    drawnDiscs.instanceMatrix.needsUpdate = true;
    drawnBevels.instanceMatrix.needsUpdate = true;
  };
  for (const m of [...discs, ...bevels]) m.layers.set(CELL_LAYER);
  parent.add(drawnDiscs, drawnBevels);
  return drawn;
}

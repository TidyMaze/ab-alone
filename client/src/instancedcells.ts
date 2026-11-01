import * as THREE from 'three/webgpu';

/** The layer of the cell discs: the raycaster tests it for picking, the camera never draws it. */
export const CELL_LAYER = 1;

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
    // Only the cells in play are drawn: the instance count is the visible ones, and the GPU never draws a vanished cell (#1314).
    let n = 0;
    discs.forEach((disc, i) => {
      if (!disc.visible) return;
      disc.updateMatrix();
      bevels[i]!.updateMatrix();
      drawnDiscs.setMatrixAt(n, disc.matrix);
      drawnBevels.setMatrixAt(n, bevel.multiplyMatrices(disc.matrix, bevels[i]!.matrix));
      n++;
    });
    drawnDiscs.count = drawnBevels.count = n;
    drawnDiscs.instanceMatrix.needsUpdate = true;
    drawnBevels.instanceMatrix.needsUpdate = true;
  };
  for (const m of [...discs, ...bevels]) m.layers.set(CELL_LAYER);
  parent.add(drawnDiscs, drawnBevels);
  return drawn;
}

/**
 * Draws the marbles under `root`, the visible meshes of `geometry`, as one instanced mesh per look added to the scene
 * `into` (#885): a draw call per look instead of one per marble. The returned sync, run before each draw, puts each marble
 * on the layer the camera skips and its instance where it stands; what a marble holds (a boss accent) is drawn as before.
 * A see-through or unseen marble is left to be drawn as it is.
 */
export function instanceMarbles(root: THREE.Object3D, geometry: THREE.BufferGeometry, into: THREE.Scene): () => void {
  const drawn = new Map<THREE.Material, THREE.InstancedMesh>();
  return () => {
    const byLook = new Map<THREE.Material, THREE.Mesh[]>();
    root.traverseVisible((o) => {
      const marble = o as THREE.Mesh;
      if (!marble.isMesh || marble.geometry !== geometry) return;
      const look = marble.material as THREE.Material;
      if (look.transparent || !look.visible) {
        if (marble.layers.isEnabled(CELL_LAYER)) marble.layers.set(0);
        return;
      }
      marble.layers.set(CELL_LAYER);
      byLook.set(look, [...(byLook.get(look) ?? []), marble]);
    });
    for (const [look, mesh] of drawn) mesh.visible = byLook.has(look);
    for (const [look, marbles] of byLook) {
      let mesh = drawn.get(look);
      if (!mesh || mesh.instanceMatrix.count < marbles.length) {
        if (mesh) {
          mesh.dispose();
          into.remove(mesh);
        }
        mesh = new THREE.InstancedMesh(geometry, look, Math.max(32, marbles.length * 2));
        mesh.frustumCulled = false; // the marbles move: their bounds would need recomputing every frame
        mesh.castShadow = mesh.receiveShadow = true; // under the terrace's sun (#1364); no light casts one in the room
        into.add(mesh);
        drawn.set(look, mesh);
      }
      mesh.count = marbles.length;
      marbles.forEach((marble, i) => {
        marble.updateWorldMatrix(true, false); // where it stands this frame, not the last
        mesh.setMatrixAt(i, marble.matrixWorld);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

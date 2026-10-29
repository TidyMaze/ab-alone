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

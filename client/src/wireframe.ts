import * as THREE from 'three';

/**
 * Manages toggling wireframe rendering on all scene meshes and displaying
 * visual helpers for all scene lights (PointLight, DirectionalLight, SpotLight).
 */
export class WireframeManager {
  active = false;
  readonly helpersGroup = new THREE.Group();

  enable(root: THREE.Object3D): void {
    if (this.active) return;
    this.active = true;

    // 1. Enable wireframe on all meshes
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const wireMat = mat as THREE.MeshStandardMaterial;
          if (wireMat.userData.origWireframe === undefined) {
            wireMat.userData.origWireframe = Boolean(wireMat.wireframe);
          }
          wireMat.wireframe = true;
        }
      }
    });

    // 2. Clear old helpers and generate fresh ones for all lights in scene
    this.helpersGroup.clear();
    root.traverse((child) => {
      if ((child as THREE.PointLight).isPointLight) {
        const light = child as THREE.PointLight;
        this.helpersGroup.add(new THREE.PointLightHelper(light, 0.6, light.color));
      } else if ((child as THREE.DirectionalLight).isDirectionalLight) {
        const light = child as THREE.DirectionalLight;
        this.helpersGroup.add(new THREE.DirectionalLightHelper(light, 1.2, light.color));
      } else if ((child as THREE.SpotLight).isSpotLight) {
        const light = child as THREE.SpotLight;
        this.helpersGroup.add(new THREE.SpotLightHelper(light, light.color));
      }
    });

    root.add(this.helpersGroup);
  }

  disable(root: THREE.Object3D): void {
    if (!this.active) return;
    this.active = false;

    // 1. Restore original wireframe state on all meshes
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const wireMat = mat as THREE.MeshStandardMaterial;
          wireMat.wireframe = Boolean(wireMat.userData.origWireframe);
        }
      }
    });

    // 2. Remove and dispose all light helpers
    root.remove(this.helpersGroup);
    this.helpersGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
    this.helpersGroup.clear();
  }

  toggle(root: THREE.Object3D): boolean {
    if (this.active) {
      this.disable(root);
    } else {
      this.enable(root);
    }
    return this.active;
  }
}

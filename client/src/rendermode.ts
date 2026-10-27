import * as THREE from 'three';

export type RenderMode = 'normal' | 'clay' | 'wireframe';

export const RENDER_MODE_NAMES: Record<RenderMode, string> = {
  normal: 'Normal',
  clay: 'Clay',
  wireframe: 'Wireframe',
};

export const nextRenderMode = (mode: RenderMode): RenderMode =>
  mode === 'normal' ? 'clay' : mode === 'clay' ? 'wireframe' : 'normal';

/**
 * Manages scene visual inspection render modes:
 * - normal: standard textured PBR materials
 * - clay: neutral matte clay PBR materials with marble contrast
 * - wireframe: mesh wireframe outlines with light position helpers
 */
export class RenderModeManager {
  mode: RenderMode = 'normal';
  readonly helpersGroup = new THREE.Group();

  readonly clayMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4cdc3,
    roughness: 0.85,
    metalness: 0.0,
  });

  readonly darkClayMaterial = new THREE.MeshStandardMaterial({
    color: 0x383a3e,
    roughness: 0.85,
    metalness: 0.0,
  });

  readonly lightClayMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8e6e0,
    roughness: 0.85,
    metalness: 0.0,
  });

  setMode(root: THREE.Object3D, mode: RenderMode): void {
    if (this.mode === mode) return;
    const prev = this.mode;
    this.mode = mode;

    if (prev === 'clay') {
      this.teardownClay(root);
    } else if (prev === 'wireframe') {
      this.teardownWireframe(root);
    }

    if (mode === 'clay') {
      this.setupClay(root);
    } else if (mode === 'wireframe') {
      this.setupWireframe(root);
    }
  }

  cycle(root: THREE.Object3D): RenderMode {
    const next = nextRenderMode(this.mode);
    this.setMode(root, next);
    return this.mode;
  }

  pickClayMaterial(mesh: THREE.Mesh): THREE.Material {
    const name = mesh.name.toLowerCase();
    if (name.includes('black') || name.includes('dark')) {
      return this.darkClayMaterial;
    }
    if (name.includes('white') || name.includes('light')) {
      return this.lightClayMaterial;
    }
    return this.clayMaterial;
  }

  private setupClay(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.userData.origMaterial = mesh.material;
        mesh.material = this.pickClayMaterial(mesh);
      }
    });
  }

  private teardownClay(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.userData.origMaterial) {
        mesh.material = mesh.userData.origMaterial;
        delete mesh.userData.origMaterial;
      }
    });
  }

  private setupWireframe(root: THREE.Object3D): void {
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

  private teardownWireframe(root: THREE.Object3D): void {
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
}

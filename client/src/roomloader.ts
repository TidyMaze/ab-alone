// PBR texture loading and monolithic spaceship bay GLB assembly for Three.js.
// Loads textures (albedo, normal, roughness, displacement) and binds them to room meshes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface PbrMaterialSet {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  displacement: THREE.Texture;
  displacementScale: number;
}

export interface SpaceshipBayAssets {
  scene: THREE.Group;
  materials: {
    deck: THREE.MeshStandardMaterial;
    bulkhead: THREE.MeshStandardMaterial;
    grate: THREE.MeshStandardMaterial;
  };
}

/** Configures texture wrapping and repeat tiling. */
function configureTiling(tex: THREE.Texture, repeat: number): void {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
}

/** Loads one PBR texture set (albedo, normal, roughness, displacement). */
export async function loadPbrMaterial(
  loader: THREE.TextureLoader,
  basePath: string,
  prefix: string,
  displacementScale = 0.05,
  repeat = 4,
): Promise<PbrMaterialSet | null> {
  try {
    const extAlbedo = prefix === 'deck-pbr' || prefix === 'bulkhead' || prefix === 'grate' ? 'jpg' : 'png';
    const [albedo, normal, roughness, displacement] = await Promise.all([
      loader.loadAsync(`${basePath}${prefix}-albedo.${extAlbedo}`),
      loader.loadAsync(`${basePath}${prefix}-normal.png`),
      loader.loadAsync(`${basePath}${prefix}-roughness.png`),
      loader.loadAsync(`${basePath}${prefix}-displacement.png`),
    ]);

    albedo.colorSpace = THREE.SRGBColorSpace;
    configureTiling(albedo, repeat);
    configureTiling(normal, repeat);
    configureTiling(roughness, repeat);
    configureTiling(displacement, repeat);

    return { albedo, normal, roughness, displacement, displacementScale };
  } catch {
    return null;
  }
}

/** Constructs a MeshStandardMaterial from a PBR texture set. */
export function createPbrStandardMaterial(pbr: PbrMaterialSet): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: pbr.albedo,
    normalMap: pbr.normal,
    roughnessMap: pbr.roughness,
    displacementMap: pbr.displacement,
    displacementScale: pbr.displacementScale,
  });
}

/** Replaces mesh material with the provided standard PBR material. */
export function applyPbrToMesh(mesh: THREE.Mesh, mat: THREE.Material): void {
  mesh.material = mat;
}

/** Loads monolithic GLB spaceship bay and attaches PBR materials to meshes. */
export async function loadSpaceshipBay(
  basePath = '/assets/pbr/',
  gltfLoader = new GLTFLoader(),
  texLoader = new THREE.TextureLoader(),
): Promise<SpaceshipBayAssets | null> {
  try {
    const [gltf, pbrDeck, pbrBulkhead, pbrGrate] = await Promise.all([
      gltfLoader.loadAsync(`${basePath}spaceship-bay.glb`),
      loadPbrMaterial(texLoader, basePath, 'deck-pbr', 0.04, 8),
      loadPbrMaterial(texLoader, basePath, 'bulkhead', 0.06, 4),
      loadPbrMaterial(texLoader, basePath, 'grate', 0.05, 4),
    ]);

    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x333b42, roughness: 0.8 });
    const deckMat = pbrDeck ? createPbrStandardMaterial(pbrDeck) : fallbackMat;
    const bulkheadMat = pbrBulkhead ? createPbrStandardMaterial(pbrBulkhead) : fallbackMat;
    const grateMat = pbrGrate ? createPbrStandardMaterial(pbrGrate) : fallbackMat;

    const sceneGroup = gltf.scene;

    sceneGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name.toLowerCase();
        if (name.includes('deck') || name.includes('pedestal') || name.includes('tank')) {
          applyPbrToMesh(mesh, deckMat);
        } else if (name.includes('wall') || name.includes('terminal') || name.includes('console')) {
          applyPbrToMesh(mesh, bulkheadMat);
        } else {
          applyPbrToMesh(mesh, grateMat);
        }
      }
    });

    return {
      scene: sceneGroup,
      materials: {
        deck: deckMat,
        bulkhead: bulkheadMat,
        grate: grateMat,
      },
    };
  } catch {
    return null;
  }
}

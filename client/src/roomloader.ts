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

export type DeckId = 'mess' | 'cargo' | 'furnace' | 'chapel' | 'bridge';

export interface DeckAtmosphereConfig {
  deckColor: number;
  bulkheadColor: number;
  grateColor: number;
  lightColor: number;
  roughness: number;
  accentLightColor: number;
}

export const DECK_ATMOSPHERES: Record<DeckId, DeckAtmosphereConfig> = {
  mess: {
    deckColor: 0x3d352e,
    bulkheadColor: 0x22262a,
    grateColor: 0x4a3a2d,
    lightColor: 0xd9822b,
    roughness: 0.8,
    accentLightColor: 0xd9822b,
  },
  cargo: {
    deckColor: 0x2a2f34,
    bulkheadColor: 0x181c20,
    grateColor: 0x333b42,
    lightColor: 0x7fd6e8,
    roughness: 0.85,
    accentLightColor: 0x7fd6e8,
  },
  furnace: {
    deckColor: 0x38221c,
    bulkheadColor: 0x1f1412,
    grateColor: 0x5a2d1d,
    lightColor: 0xe86a33,
    roughness: 0.75,
    accentLightColor: 0xff4d00,
  },
  chapel: {
    deckColor: 0x323038,
    bulkheadColor: 0x1c1b22,
    grateColor: 0x3d3a48,
    lightColor: 0xa29bfe,
    roughness: 0.9,
    accentLightColor: 0x6c5ce7,
  },
  bridge: {
    deckColor: 0x243238,
    bulkheadColor: 0x141f24,
    grateColor: 0x2d434d,
    lightColor: 0x55efc4,
    roughness: 0.7,
    accentLightColor: 0x00cec9,
  },
};

export function applyDeckAtmosphere(
  bay: { materials: { deck: THREE.MeshStandardMaterial; bulkhead: THREE.MeshStandardMaterial; grate: THREE.MeshStandardMaterial } },
  deck: DeckId,
): void {
  const conf = DECK_ATMOSPHERES[deck];
  bay.materials.deck.color.setHex(conf.deckColor);
  bay.materials.deck.roughness = conf.roughness;
  bay.materials.bulkhead.color.setHex(conf.bulkheadColor);
  bay.materials.bulkhead.roughness = conf.roughness;
  bay.materials.grate.color.setHex(conf.grateColor);
  bay.materials.grate.roughness = conf.roughness;
}

export function createBayLights(deck: DeckId): THREE.Group {
  const conf = DECK_ATMOSPHERES[deck];
  const group = new THREE.Group();

  const overhead = new THREE.PointLight(conf.lightColor, 0.45, 36.0);
  overhead.position.set(0, 14.0, 0);

  const airlock = new THREE.PointLight(conf.accentLightColor, 0.55, 26.0);
  airlock.position.set(0, 7.5, -22.0);

  const consoleBounce = new THREE.PointLight(conf.lightColor, 0.35, 12.0);
  consoleBounce.position.set(-10.0, 2.5, 12.0);

  const pedestalWash = new THREE.PointLight(0x7fd6e8, 0.25, 8.0);
  pedestalWash.position.set(0, -0.1, 0);

  group.add(overhead, airlock, consoleBounce, pedestalWash);
  return group;
}

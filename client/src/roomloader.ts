// PBR texture loading and monolithic spaceship bay GLB assembly for Three.js.
// Loads textures (albedo, normal, roughness, displacement) and binds them to room meshes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createCanvasTexture, drawHollowMoon } from './roomart';

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
    trench?: THREE.MeshStandardMaterial;
    conduit?: THREE.MeshStandardMaterial;
  };
}

/** Configures texture wrapping and repeat tiling. */
function configureTiling(tex: THREE.Texture, repeat: number): void {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
}

/** What loads the maps: main.ts's KTX2Loader, every map ships as KTX2 (#700). */
export interface TextureSource {
  loadAsync(url: string): Promise<THREE.Texture>;
}

/** Loads one PBR texture set (albedo, normal, roughness, displacement). */
export async function loadPbrMaterial(
  loader: TextureSource,
  basePath: string,
  prefix: string,
  displacementScale = 0.05,
  repeat = 4,
): Promise<PbrMaterialSet | null> {
  try {
    const [albedo, normal, roughness, displacement] = await Promise.all([
      loader.loadAsync(`${basePath}${prefix}-albedo.ktx2`),
      loader.loadAsync(`${basePath}${prefix}-normal.ktx2`),
      loader.loadAsync(`${basePath}${prefix}-roughness.ktx2`),
      loader.loadAsync(`${basePath}${prefix}-displacement.ktx2`),
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

/** A glTF loader for the models, meshopt-compressed by scripts/pack-models.mjs (#701). */
export function meshoptLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

/** Loads monolithic GLB spaceship bay and attaches PBR materials to meshes. */
export async function loadSpaceshipBay(
  basePath = '/assets/pbr/',
  gltfLoader = meshoptLoader(),
  texLoader: TextureSource,
): Promise<SpaceshipBayAssets | null> {
  try {
    const [gltf, pbrDeck, pbrBulkhead, pbrGrate] = await Promise.all([
      gltfLoader.loadAsync(`${basePath}spaceship-bay.glb`),
      loadPbrMaterial(texLoader, basePath, 'deck-pbr', 0, 0.5),
      loadPbrMaterial(texLoader, basePath, 'bulkhead', 0.06, 1),
      loadPbrMaterial(texLoader, basePath, 'grate', 0.05, 1),
    ]);

    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x333b42, roughness: 0.8 });
    const deckMat = pbrDeck ? createPbrStandardMaterial(pbrDeck) : fallbackMat;
    const bulkheadMat = pbrBulkhead ? createPbrStandardMaterial(pbrBulkhead) : fallbackMat;
    const grateMat = pbrGrate ? createPbrStandardMaterial(pbrGrate) : fallbackMat;
    const trenchMat = new THREE.MeshStandardMaterial({
      color: 0x48525b,
      roughness: 0.3,
      metalness: 0.85,
      ...(grateMat.map ? { map: grateMat.map } : {}),
      ...(grateMat.normalMap ? { normalMap: grateMat.normalMap } : {}),
      ...(grateMat.roughnessMap ? { roughnessMap: grateMat.roughnessMap } : {}),
    });
    const conduitMat = new THREE.MeshStandardMaterial({
      color: 0x2b3238,
      roughness: 0.25,
      metalness: 0.9,
      emissive: 0x288899,
      emissiveIntensity: 0.65,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xd9822b,
      roughness: 0.45,
      metalness: 0.35,
      emissive: 0xd9822b,
      emissiveIntensity: 0.25,
    });
    const moonCanvas = createCanvasTexture(1024, 1024, drawHollowMoon);
    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.colorSpace = THREE.SRGBColorSpace;
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: moonTex,
      roughness: 0.85,
      metalness: 0.1,
      emissive: 0x9cb0c2,
      emissiveIntensity: 0.85,
      emissiveMap: moonTex,
      fog: false,
    });

    const sceneGroup = gltf.scene;

    sceneGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name.toLowerCase();
        if (name.includes('grate_trench') || name.includes('trench')) {
          applyPbrToMesh(mesh, trenchMat);
        } else if (name.includes('conduit')) {
          applyPbrToMesh(mesh, conduitMat);
        } else if (name.includes('pedestal')) {
          if (name === 'pedestal_core') {
            const pos = mesh.geometry.getAttribute('position');
            const uv = mesh.geometry.getAttribute('uv');
            for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.75, pos.getZ(i) * 0.75);
            uv.needsUpdate = true;
            mesh.position.y = -0.45;
            mesh.visible = false;
          }
          applyPbrToMesh(mesh, deckMat);
        } else if (name.includes('hazard')) {
          applyPbrToMesh(mesh, hazardMat);
        } else if (name.includes('moon')) {
          applyPbrToMesh(mesh, moonMat);
        } else if (name === 'console_screen' || name.includes('terminal') || name.includes('tank')) {
          mesh.visible = false;
        } else if (name.includes('deck')) {
          applyPbrToMesh(mesh, deckMat);
        } else if (name.includes('wall') || name.includes('console') || (name.includes('bulkhead') && !name.includes('column'))) {
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
        trench: trenchMat,
        conduit: conduitMat,
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
  fogColor: number;
}

export const DECK_ATMOSPHERES: Record<DeckId, DeckAtmosphereConfig> = {
  mess: {
    deckColor: 0x3d352e,
    bulkheadColor: 0x22262a,
    grateColor: 0x4a3a2d,
    lightColor: 0xd9822b,
    roughness: 0.8,
    accentLightColor: 0xd9822b,
    fogColor: 0x1c1612,
  },
  cargo: {
    deckColor: 0x2a2f34,
    bulkheadColor: 0x181c20,
    grateColor: 0x333b42,
    lightColor: 0x7fd6e8,
    roughness: 0.85,
    accentLightColor: 0x7fd6e8,
    fogColor: 0x12161a,
  },
  furnace: {
    deckColor: 0x38221c,
    bulkheadColor: 0x1f1412,
    grateColor: 0x5a2d1d,
    lightColor: 0xe86a33,
    roughness: 0.75,
    accentLightColor: 0xff4d00,
    fogColor: 0x20120d,
  },
  chapel: {
    deckColor: 0x323038,
    bulkheadColor: 0x1c1b22,
    grateColor: 0x3d3a48,
    lightColor: 0xa29bfe,
    roughness: 0.9,
    accentLightColor: 0x6c5ce7,
    fogColor: 0x181620,
  },
  bridge: {
    deckColor: 0x243238,
    bulkheadColor: 0x141f24,
    grateColor: 0x2d434d,
    lightColor: 0x55efc4,
    roughness: 0.7,
    accentLightColor: 0x00cec9,
    fogColor: 0x0f191d,
  },
};

export function applyDeckAtmosphere(
  bay: {
    materials: {
      deck: THREE.MeshStandardMaterial;
      bulkhead: THREE.MeshStandardMaterial;
      grate: THREE.MeshStandardMaterial;
      trench?: THREE.MeshStandardMaterial;
      conduit?: THREE.MeshStandardMaterial;
    };
  },
  deck: DeckId,
): void {
  const conf = DECK_ATMOSPHERES[deck];
  bay.materials.deck.color.setHex(conf.deckColor);
  bay.materials.deck.roughness = conf.roughness;
  bay.materials.bulkhead.color.setHex(conf.bulkheadColor);
  bay.materials.bulkhead.roughness = conf.roughness;
  bay.materials.grate.color.setHex(conf.grateColor);
  bay.materials.grate.roughness = conf.roughness;
  if (bay.materials.trench) {
    bay.materials.trench.color.setHex(conf.grateColor);
    bay.materials.trench.roughness = Math.min(conf.roughness, 0.4);
  }
  if (bay.materials.conduit) {
    bay.materials.conduit.emissive.setHex(conf.accentLightColor);
  }
}

export function createBayLights(deck: DeckId): THREE.Group {
  const conf = DECK_ATMOSPHERES[deck];
  const group = new THREE.Group();
  group.name = 'bay_lights';

  const overhead = new THREE.PointLight(conf.lightColor, 0.45, 36.0);
  overhead.position.set(0, 14.0, 0);

  const airlock = new THREE.PointLight(conf.accentLightColor, 0.55, 26.0);
  airlock.position.set(0, 8.0, -17.5);

  const consoleBounce = new THREE.PointLight(conf.lightColor, 0.35, 16.0);
  consoleBounce.position.set(-10.2, 2.5, -6.0);

  const viewportLight = new THREE.PointLight(0x7fd6e8, 0.5, 24.0);
  viewportLight.position.set(17.0, 4.8, 0);

  const observationLight = new THREE.PointLight(conf.accentLightColor, 0.15, 16.0);
  observationLight.position.set(0, 7.0, 17.5);

  const pedestalWash = new THREE.PointLight(0x7fd6e8, 0.25, 8.0);
  pedestalWash.position.set(0, -0.1, 0);

  group.add(overhead, airlock, consoleBounce, viewportLight, observationLight, pedestalWash);
  return group;
}

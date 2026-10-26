import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  applyDeckAtmosphere,
  applyPbrToMesh,
  createBayLights,
  createPbrStandardMaterial,
  DECK_ATMOSPHERES,
  type DeckId,
  loadPbrMaterial,
  loadSpaceshipBay,
  meshoptLoader,
  type PbrMaterialSet,
} from './roomloader';

// The models are read from disk with node:fs imported untyped, as in antistalling.test.ts: the client has no Node types.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };

describe('roomloader PBR pipeline', () => {
  it('creates MeshStandardMaterial with map, normalMap, roughnessMap, and displacementMap', () => {
    const albedo = new THREE.Texture();
    const normal = new THREE.Texture();
    const roughness = new THREE.Texture();
    const displacement = new THREE.Texture();

    const pbrSet: PbrMaterialSet = {
      albedo,
      normal,
      roughness,
      displacement,
      displacementScale: 0.08,
    };

    const mat = createPbrStandardMaterial(pbrSet);
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(mat.map).toBe(albedo);
    expect(mat.normalMap).toBe(normal);
    expect(mat.roughnessMap).toBe(roughness);
    expect(mat.displacementMap).toBe(displacement);
    expect(mat.displacementScale).toBe(0.08);
  });

  it('applies material to a mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const newMat = new THREE.MeshStandardMaterial();
    applyPbrToMesh(mesh, newMat);
    expect(mesh.material).toBe(newMat);
  });

  it('loads PBR texture set with wrapping and color spaces', async () => {
    const mockLoader = {
      loadAsync: vi.fn(async (url: string) => {
        const tex = new THREE.Texture();
        tex.name = url;
        return tex;
      }),
    } as unknown as THREE.TextureLoader;

    const pbr = await loadPbrMaterial(mockLoader, '/assets/pbr/', 'bulkhead', 0.05, 3);
    expect(pbr).not.toBeNull();
    expect(pbr!.displacementScale).toBe(0.05);
    expect(pbr!.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(pbr!.albedo.wrapS).toBe(THREE.RepeatWrapping);
    expect(pbr!.albedo.repeat.x).toBe(3);
    expect(pbr!.normal.wrapS).toBe(THREE.RepeatWrapping);
    // Every map ships as KTX2 (#700).
    expect(vi.mocked(mockLoader.loadAsync).mock.calls.map(([url]) => url)).toEqual([
      '/assets/pbr/bulkhead-albedo.ktx2',
      '/assets/pbr/bulkhead-normal.ktx2',
      '/assets/pbr/bulkhead-roughness.ktx2',
      '/assets/pbr/bulkhead-displacement.ktx2',
    ]);
  });

  it('returns null if any texture fails to load in loadPbrMaterial', async () => {
    const mockLoader = {
      loadAsync: vi.fn(async (url: string) => {
        if (url.includes('normal')) throw new Error('Failed to load normal');
        return new THREE.Texture();
      }),
    } as unknown as THREE.TextureLoader;

    const pbr = await loadPbrMaterial(mockLoader, '/assets/pbr/', 'bulkhead');
    expect(pbr).toBeNull();
  });

  it('loads spaceship bay GLB and binds PBR materials to mesh hierarchy', async () => {
    const mockGroup = new THREE.Group();
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry());
    floorMesh.name = 'Ship_Deck_Floor';
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry());
    wallMesh.name = 'Bulkhead_Wall_North';
    const ribMesh = new THREE.Mesh(new THREE.BoxGeometry());
    ribMesh.name = 'Gantry_Arch_Rib_1';

    mockGroup.add(floorMesh, wallMesh, ribMesh);

    const mockGltfLoader = {
      loadAsync: vi.fn(async () => ({
        scene: mockGroup,
      })),
    };

    const mockTexLoader = {
      loadAsync: vi.fn(async (url: string) => {
        const tex = new THREE.Texture();
        tex.name = url;
        return tex;
      }),
    } as unknown as THREE.TextureLoader;

    const bay = await loadSpaceshipBay('/assets/pbr/', mockGltfLoader as any, mockTexLoader);
    expect(bay).not.toBeNull();
    expect(bay!.scene).toBe(mockGroup);
    expect(floorMesh.material).toBe(bay!.materials.deck);
    expect(bay!.materials.deck.map?.repeat.x).toBe(0.5);
    expect(wallMesh.material).toBe(bay!.materials.bulkhead);
    expect(ribMesh.material).toBe(bay!.materials.grate);

    // Test with textures failing: falls back to fallbackMat
    const failingTexLoader = {
      loadAsync: vi.fn(async () => {
        throw new Error('404');
      }),
    } as unknown as THREE.TextureLoader;
    const fallbackBay = await loadSpaceshipBay('/assets/pbr/', mockGltfLoader as any, failingTexLoader);
    expect(fallbackBay).not.toBeNull();
    expect((floorMesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x333b42);
  });

  it('decodes the meshopt-compressed bay with its named meshes and their UVs (#701)', async () => {
    const loader = meshoptLoader();
    expect(loader.meshoptDecoder).toBe(MeshoptDecoder);
    const read = async (path: string): Promise<ArrayBuffer> => new Uint8Array(await readFile(new URL(path, import.meta.url))).buffer;
    const names = async (glb: ArrayBuffer): Promise<string[]> => {
      const meshes: THREE.Mesh[] = [];
      (await loader.parseAsync(glb, '')).scene.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
      for (const mesh of meshes) expect(mesh.geometry.getAttribute('uv')).toBeDefined(); // the PBR maps tile on them
      return meshes.map((mesh) => mesh.name).sort();
    };
    const shipped = await names(await read('../public/assets/pbr/spaceship-bay.glb'));
    expect(shipped).toHaveLength(15);
    expect(shipped).toEqual(await names(await read('../models/spaceship-bay.glb'))); // the materials are picked by these names
  });

  it('returns null if GLB fails to load', async () => {
    const mockGltfLoader = {
      loadAsync: vi.fn(async () => {
        throw new Error('GLB 404');
      }),
    };
    const mockTexLoader = {
      loadAsync: vi.fn(async () => new THREE.Texture()),
    } as unknown as THREE.TextureLoader;

    const bay = await loadSpaceshipBay('/assets/pbr/', mockGltfLoader as any, mockTexLoader);
    expect(bay).toBeNull();
  });

  it('defines 5 unique deck atmospheric profiles (#660)', () => {
    const decks: DeckId[] = ['mess', 'cargo', 'furnace', 'chapel', 'bridge'];
    for (const d of decks) {
      const conf = DECK_ATMOSPHERES[d];
      expect(conf).toBeDefined();
      expect(typeof conf.deckColor).toBe('number');
      expect(typeof conf.bulkheadColor).toBe('number');
      expect(typeof conf.grateColor).toBe('number');
      expect(typeof conf.lightColor).toBe('number');
      expect(typeof conf.roughness).toBe('number');
      expect(typeof conf.fogColor).toBe('number');
    }
  });

  it('defines distinct fogColor for all decks matching agreed atmospheres (#665)', () => {
    expect(DECK_ATMOSPHERES.mess.fogColor).toBe(0x1c1612);
    expect(DECK_ATMOSPHERES.cargo.fogColor).toBe(0x12161a);
    expect(DECK_ATMOSPHERES.furnace.fogColor).toBe(0x20120d);
    expect(DECK_ATMOSPHERES.chapel.fogColor).toBe(0x181620);
    expect(DECK_ATMOSPHERES.bridge.fogColor).toBe(0x0f191d);
  });

  it('applies deck atmosphere colors and roughness to bay materials (#660)', () => {
    const deckMat = new THREE.MeshStandardMaterial();
    const bulkheadMat = new THREE.MeshStandardMaterial();
    const grateMat = new THREE.MeshStandardMaterial();
    const bay = {
      scene: new THREE.Group(),
      materials: { deck: deckMat, bulkhead: bulkheadMat, grate: grateMat },
    };

    applyDeckAtmosphere(bay, 'furnace');
    expect(deckMat.color.getHex()).toBe(DECK_ATMOSPHERES.furnace.deckColor);
    expect(bulkheadMat.color.getHex()).toBe(DECK_ATMOSPHERES.furnace.bulkheadColor);
    expect(grateMat.color.getHex()).toBe(DECK_ATMOSPHERES.furnace.grateColor);
    expect(deckMat.roughness).toBe(DECK_ATMOSPHERES.furnace.roughness);

    applyDeckAtmosphere(bay, 'bridge');
    expect(deckMat.color.getHex()).toBe(DECK_ATMOSPHERES.bridge.deckColor);
    expect(bulkheadMat.color.getHex()).toBe(DECK_ATMOSPHERES.bridge.bulkheadColor);
  });

  it('creates atmospheric bay lights matching deck specifications (#660)', () => {
    const lights = createBayLights('mess');
    expect(lights).toBeInstanceOf(THREE.Group);
    expect(lights.children.length).toBeGreaterThanOrEqual(3);

    const pointLights = lights.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(pointLights.length).toBeGreaterThanOrEqual(3);

    // Overrides with deck-specific accent light
    const furnaceLights = createBayLights('furnace');
    expect(furnaceLights.children.length).toBe(lights.children.length);
  });
});

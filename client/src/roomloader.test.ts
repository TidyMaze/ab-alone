// @vitest-environment jsdom
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
    const pedestalMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4));
    pedestalMesh.name = 'Pedestal_Core';
    const pedestalBase = new THREE.Mesh(new THREE.BoxGeometry());
    pedestalBase.name = 'Pedestal_Base';
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry());
    wallMesh.name = 'Bulkhead_Wall_North';
    const columnMesh = new THREE.Mesh(new THREE.BoxGeometry());
    columnMesh.name = 'Bulkhead_Column_East';
    const terminalMesh = new THREE.Mesh(new THREE.BoxGeometry());
    terminalMesh.name = 'CRT_Terminal_Bank';
    const ribMesh = new THREE.Mesh(new THREE.BoxGeometry());
    ribMesh.name = 'Gantry_Arch_Rib_1';
    const trenchMesh = new THREE.Mesh(new THREE.BoxGeometry());
    trenchMesh.name = 'Pedestal_Grate_Trench';
    const conduitMesh = new THREE.Mesh(new THREE.BoxGeometry());
    conduitMesh.name = 'Radial_Floor_Conduits';
    const hazardMesh = new THREE.Mesh(new THREE.BoxGeometry());
    hazardMesh.name = 'Airlock_Hazard_Chevrons';
    const moonMesh = new THREE.Mesh(new THREE.BoxGeometry());
    moonMesh.name = 'Hollow_Moon_Disc';
    const screenMesh = new THREE.Mesh(new THREE.BoxGeometry());
    screenMesh.name = 'Console_Screen';

    mockGroup.add(floorMesh, pedestalMesh, pedestalBase, wallMesh, columnMesh, terminalMesh, ribMesh, trenchMesh, conduitMesh, hazardMesh, moonMesh, screenMesh);

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
    expect(pedestalMesh.material).toBe(bay!.materials.deck);
    expect(pedestalBase.material).toBe(bay!.materials.deck);
    expect(Math.abs(pedestalMesh.geometry.getAttribute('uv').getX(0))).toBeCloseTo(1.5);
    expect(bay!.materials.deck.map?.repeat.x).toBe(0.2);
    expect(wallMesh.material).toBe(bay!.materials.bulkhead);
    expect(columnMesh.material).toBe(bay!.materials.grate);
    expect(pedestalMesh.visible).toBe(false);
    expect(pedestalMesh.position.y).toBeLessThanOrEqual(-0.3);
    expect(trenchMesh.material).toBe(bay!.materials.trench);
    expect(conduitMesh.material).toBe(bay!.materials.conduit);
    expect(terminalMesh.visible).toBe(false);
    expect(screenMesh.visible).toBe(false);
    expect(ribMesh.material).toBe(bay!.materials.grate);
    expect((hazardMesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xd9822b);
    expect((moonMesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
    expect((moonMesh.material as THREE.MeshStandardMaterial).fog).toBe(false);

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
    expect(shipped).toHaveLength(28);
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
    const trenchMat = new THREE.MeshStandardMaterial();
    const conduitMat = new THREE.MeshStandardMaterial();
    const bay = {
      scene: new THREE.Group(),
      materials: { deck: deckMat, bulkhead: bulkheadMat, grate: grateMat, trench: trenchMat, conduit: conduitMat },
    };

    applyDeckAtmosphere(bay, 'furnace');
    expect(deckMat.color.getHex()).toBe(DECK_ATMOSPHERES.furnace.deckColor);
    expect(bulkheadMat.color.getHex()).toBe(DECK_ATMOSPHERES.furnace.bulkheadColor);
    expect(grateMat.color.getHex()).toBe(DECK_ATMOSPHERES.furnace.grateColor);
    expect(trenchMat.color.getHex()).toBe(0x2b3137);
    expect(conduitMat.emissive.getHex()).toBe(DECK_ATMOSPHERES.furnace.accentLightColor);
    expect(deckMat.roughness).toBe(DECK_ATMOSPHERES.furnace.roughness);

    applyDeckAtmosphere(bay, 'bridge');
    expect(deckMat.color.getHex()).toBe(DECK_ATMOSPHERES.bridge.deckColor);
    expect(bulkheadMat.color.getHex()).toBe(DECK_ATMOSPHERES.bridge.bulkheadColor);

    // Also covers fallback when trench/conduit are omitted
    applyDeckAtmosphere({ materials: { deck: deckMat, bulkhead: bulkheadMat, grate: grateMat } }, 'mess');

    // With maps attached, preserve full albedo luminance
    deckMat.map = new THREE.Texture();
    bulkheadMat.map = new THREE.Texture();
    grateMat.map = new THREE.Texture();
    trenchMat.map = new THREE.Texture();
    applyDeckAtmosphere(bay, 'cargo');
    expect(deckMat.color.getHex()).toBe(0xffffff);
    expect(bulkheadMat.color.getHex()).toBe(0xffffff);
    expect(grateMat.color.getHex()).toBe(0xffffff);
    expect(trenchMat.color.getHex()).toBe(0x2b3137);
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

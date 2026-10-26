import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  applyPbrToMesh,
  createPbrStandardMaterial,
  loadPbrMaterial,
  loadSpaceshipBay,
  type PbrMaterialSet,
} from './roomloader';

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
    expect(mockLoader.loadAsync).toHaveBeenCalledTimes(4);

    // Test non-standard prefix with png albedo fallback
    const pbrCustom = await loadPbrMaterial(mockLoader, '/assets/pbr/', 'custom-hull');
    expect(pbrCustom).not.toBeNull();
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
});

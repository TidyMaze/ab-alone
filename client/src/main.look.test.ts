// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Axial } from './board';
import { MARBLE_LOOK, TONAL, tonalMarble } from './look';
import { GLASS_SKINS } from './glassskins';
import { SKINS } from './skins';
import { boot } from './test/harness';

// The tonal look of the board and the marbles (#1138, look.ts): flat tonal materials, one tone per skin, and none of the
// board's, cells' or skins' maps. `?look=pbr` (the default) keeps the maps of today.

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** Catches the scene main.ts builds: call before boot. */
function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && !scene) scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => spy.mockRestore());
  return () => scene!;
}

/** The names of the maps the scene's materials hold. */
function mapNames(scene: THREE.Scene): Set<string> {
  const names = new Set<string>();
  scene.traverse((o) => {
    const material = (o as Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!material) return;
    for (const map of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap, material.emissiveMap])
      if (map) names.add(map.name);
  });
  return names;
}

const materialsWith = (scene: THREE.Scene, color: number): THREE.MeshStandardMaterial[] => {
  const found: THREE.MeshStandardMaterial[] = [];
  scene.traverse((o) => {
    const material = (o as Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (material?.color?.getHex() === color) found.push(material);
  });
  return found;
};

describe('main.ts tonal look (#1138)', () => {
  it('draws the plate, the cells and the marbles as flat tonal materials, and loads no skin, cell or plate map', async () => {
    const scene = catchScene();
    await boot('/?bot=off&look=tonal');
    const maps = mapNames(scene());
    expect([...maps].filter((name) => /skin-|deck-|board-|plate-/.test(name))).toEqual([]);
    expect(materialsWith(scene(), TONAL.plate).length).toBeGreaterThan(0);
    expect(materialsWith(scene(), TONAL.cell).length).toBeGreaterThan(0); // the cells and the rim
    const shell = materialsWith(scene(), tonalMarble(1, SKINS[0]!.color))[0]!;
    expect(shell.roughness).toBe(MARBLE_LOOK.roughness);
    expect(shell.map).toBeNull();
    const glass = materialsWith(scene(), tonalMarble(2, GLASS_SKINS[0]!.color))[0]!;
    expect(glass.metalness).toBe(MARBLE_LOOK.metalness);
    expect(glass.map).toBeNull();
  });

  it.each(['/?bot=off', '/?bot=off&look=pbr'])('keeps the maps of today in the pbr look, %s', async (search) => {
    const scene = catchScene();
    await boot(search);
    const maps = mapNames(scene());
    expect(maps).toContain('skin-Leather027-albedo.ktx2');
    expect(maps).toContain('skin-Marble025-albedo.ktx2');
    expect(materialsWith(scene(), TONAL.plate)).toEqual([]);
  });

  it('wears the next skin as one tone too, a lava with its own tone as light and no emission map', async () => {
    const lava = SKINS.find((s) => s.id === 'slag')!;
    const scene = catchScene();
    const game = await boot('/?bot=off&look=tonal');
    game.openSettings();
    byId('setting-shell-skin').click(); // Black porcelain
    byId('setting-shell-skin').click(); // Lava
    await game.settle();
    const worn = materialsWith(scene(), tonalMarble(1, lava.color))[0]!;
    expect(worn.emissive.getHex()).toBe(tonalMarble(1, lava.color)); // not the white of the emission map
    expect(worn.emissiveMap).toBeNull();
    expect(worn.metalness).toBe(0);
  });

  it('veils the Stalker cells in the veiled tone, rings the selection and the last move in sky blue', async () => {
    const scene = catchScene();
    const game = await boot('/?look=tonal');
    byId('boss-fight').click();
    [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Stalker')!.click();
    const veil = scene().getObjectByName('stalker-fog') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(veil.material.color.getHex()).toBe(TONAL.veiled);
    expect(veil.material.opacity).toBe(1);
    const move = game.hook<{ cells: Axial[]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...move.cells[0]!);
    expect(materialsWith(scene(), TONAL.last).length).toBeGreaterThan(0); // the selection ring
    game.click(...game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
    game.frame(300);
    await game.settle();
    game.frame(300);
    const last = scene().getObjectsByProperty('name', 'stalker-last') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
    expect(last.length).toBeGreaterThan(0);
    expect(last[0]!.material.color.getHex()).toBe(TONAL.last);
  });
});

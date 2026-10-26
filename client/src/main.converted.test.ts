// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { axialTo3D, type Axial } from './board';
import { CONVERTED } from './marbles';
import { PALETTE_DEFS } from './palettes';
import { boot, type Game } from './test/harness';

// The converted look of main.ts (#508, world.md section 5): a marble The Chaplain converted is the ridged shell up to its
// middle and the player's glass above it with a dimmed core, both halves kept upright whatever the marble's turn, under
// the candle wax of the boss side (#507). It replaces the cyan cap of #326. The scene the page draws is caught when
// main.ts builds it, so a test reads what the renderer would draw.

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
type Look = { cell: Axial; parts: string[] };
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

/** Starts The Chaplain (fight seed 1) and plays NE moves until a marble is converted: on the 5th boss turn (#429). */
async function convertOne(game: Game): Promise<Axial[]> {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(1);
    return a;
  });
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Chaplain')!.click();
  expect(await game.hook<Promise<number>>('__playTurns', 5, [2])).toBe(5);
  const cells = game.hook<Axial[]>('__converted');
  expect(cells.length).toBeGreaterThan(0);
  return cells;
}

/** The board's marbles: the group that holds the player's glass marbles. */
function boardMarbles(scene: THREE.Scene): Mesh[] {
  const glass = (scene.getObjectsByProperty('type', 'Mesh') as Mesh[]).find(
    (m) => m.material instanceof THREE.MeshPhysicalMaterial && m.parent instanceof THREE.Group,
  )!;
  return glass.parent!.children as Mesh[];
}
/** The marble drawn on a cell: the one mesh of the board's marbles standing on it. */
function marbleOn(scene: THREE.Scene, [q, r]: Axial): Mesh {
  const p = axialTo3D(q, r);
  const on = boardMarbles(scene).filter(
    (o) => Math.abs(o.position.x - p.x) < 1e-6 && Math.abs(o.position.z - p.z) < 1e-6 && o.position.y > 0.2,
  );
  expect(on, 'nothing else drawn on the marble, no cap').toHaveLength(1);
  return on[0]!;
}
const part = (marble: THREE.Object3D, name: string): Mesh => marble.getObjectByName(name) as Mesh;
/** True when `mesh` faces the world the way it was built: no turn left on it once its parents' turns are applied. */
const upright = (mesh: THREE.Object3D): boolean => {
  mesh.updateWorldMatrix(true, false);
  return mesh.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion()) < 1e-6;
};
const box = (mesh: Mesh): THREE.Box3 => (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox!);

describe('main.ts converted look (#508)', () => {
  it('a converted marble is the ridged shell below, the glass above with a dimmed core, under the wax', async () => {
    const scene = catchScene();
    const game = await boot('?nodes=200', { reducedMotion: true });
    const cells = await convertOne(game);
    const looks = game.hook<Look[]>('__convertedLooks');
    expect(looks).toHaveLength(cells.length);
    expect(looks).toEqual(expect.arrayContaining(cells.map((cell) => ({ cell, parts: ['wax', 'shell', 'glass', 'core'] }))));
    expect(new Set(game.hook<{ accent: string }[]>('__accents').map((w) => w.accent))).toEqual(new Set(['wax'])); // no part is an accent
    const marbles = boardMarbles(scene());
    const plainShell = marbles.find((m) => m.getObjectByName('wax') && m.material.visible)!.material;
    const playerGlass = marbles.find((m) => m.material instanceof THREE.MeshPhysicalMaterial)!.material;
    for (const cell of cells) {
      const marble = marbleOn(scene(), cell);
      expect(marble.material.visible).toBe(false); // only its halves are drawn
      const [shell, glass, core] = ['shell', 'glass', 'core'].map((name) => part(marble, name));
      expect(shell!.material).toBe(plainShell); // the ridged shell of the boss side
      expect(glass!.material).toBe(playerGlass); // the player's glass
      expect(box(shell!).max.y).toBeLessThanOrEqual(1e-6); // up to the middle
      expect(box(glass!).min.y).toBeGreaterThanOrEqual(-1e-6); // above it
      expect(box(core!).min.y).toBeGreaterThanOrEqual(-1e-6); // in the glass half
      const light = core!.material as THREE.MeshBasicMaterial;
      expect(light.opacity).toBe(CONVERTED.core);
      expect(light.color.getHex()).toBe(PALETTE_DEFS.default.core);
      for (const p of [shell, glass, core, part(marble, 'wax')]) expect(upright(p!)).toBe(true);
    }
  }, 60_000);

  it('follows the palette and the glass skin', async () => {
    const scene = catchScene();
    const game = await boot('?nodes=200', { reducedMotion: true });
    const [cell] = await convertOne(game);
    const light = () => part(marbleOn(scene(), cell!), 'core').material as THREE.MeshBasicMaterial;
    game.openSettings();
    byId('setting-palette').click();
    expect(game.hook('__palette')).toBe('protan');
    expect(light().color.getHex()).toBe(PALETTE_DEFS.protan.core);
    for (let i = 0; i < 6; i++) byId('setting-glass-skin').click(); // smoked to the Lantern core
    expect(light().color.getHex()).toBe(0xf2c27a);
    const glass = part(marbleOn(scene(), cell!), 'glass').material;
    expect(glass).toBe(boardMarbles(scene()).find((m) => m.material instanceof THREE.MeshPhysicalMaterial)!.material);
  }, 60_000);
});

// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { LIGHT_BUDGET } from './roomrefined';
import { boot } from './test/harness';

// The refined room of main.ts (#1138): behind ?room=refined (the default on this branch) the room holds a key point light, a
// hemisphere fill, the wall, four strips, a hazard stripe and four crates; today's room keeps its props and its tubes' rows.

const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** Catches the scene main.ts builds: call before boot. */
function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && !scene) scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => void spy.mockRestore());
  return () => scene!;
}

const lights = (scene: THREE.Scene): string[] => {
  const names: string[] = [];
  scene.traverse((o) => void ((o as THREE.PointLight).isPointLight && names.push(o.name)));
  return names;
};

describe('main.ts refined room (#1138)', () => {
  it('lights the room with the key, and the hemisphere fill, no point light more', async () => {
    const scene = catchScene();
    await boot('/?bot=off&room=refined');
    expect(lights(scene())).toEqual(['key']);
    expect(scene().getObjectByName('fill')).toBeInstanceOf(THREE.HemisphereLight);
    for (const name of ['wall', 'hazard-stripe', 'strip-1', 'crate-0']) expect(scene().getObjectByName(name), name).toBeDefined();
    expect(scene().getObjectByName('ring-lamp')).toBeUndefined();
    for (const name of ['console-screen', 'log-recorder']) expect(scene().getObjectByName(name), name).toBeDefined(); // gameplay stays
    expect(scene().getObjectByName('machinery-stack-main')).toBeUndefined(); // decor goes
  });

  it('adds the amber rim in a boss fight, two point lights in all', async () => {
    const scene = catchScene();
    const game = await boot('/?bot=off&room=refined');
    byId('boss-fight').click();
    [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Hull')!.click();
    game.frame(300);
    expect(lights(scene())).toEqual(['key', 'rim']);
    expect(lights(scene()).length + 1).toBeLessThanOrEqual(LIGHT_BUDGET);
  });

  it("keeps today's lights and props with ?room=today", async () => {
    const scene = catchScene();
    await boot('/?bot=off&room=today');
    expect(lights(scene()).length).toBeGreaterThan(LIGHT_BUDGET);
    expect(scene().getObjectByName('wall')).toBeUndefined();
    expect(scene().getObjectByName('ring-lamp')).toBeDefined();
  });

  it('tints the strips with the deck it is on', async () => {
    const scene = catchScene();
    const game = await boot('/?bot=off&room=refined');
    const strip = (): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> => scene().getObjectByName('strip-1') as never;
    expect(strip().material.emissive.getHex()).toBe(0x6fa8dc);
    game.hook('__deck', 'furnace');
    expect(strip().material.emissive.getHex()).toBe(0xffb000);
  });
});

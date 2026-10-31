// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { LIGHT_BUDGET } from './roomrefined';
import { boot } from './test/harness';

// The refined room of main.ts (#1138): behind ?room=refined the room holds the rig of roomrefined.ts, six point lights at
// most, and the pool of light under the board; today's room keeps its tubes' rows.

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
  it('lights the room with the five lights of the rig and lays the pool of light under the board', async () => {
    const scene = catchScene();
    await boot('/?bot=off&room=refined');
    expect(lights(scene())).toEqual(['key', 'fill', 'strip 1', 'strip 2', 'strip 3']);
    expect(scene().getObjectByName('light pool')).toBeDefined();
  });

  it('adds the amber rim in a boss fight, six lights in all', async () => {
    const scene = catchScene();
    const game = await boot('/?bot=off&room=refined');
    byId('boss-fight').click();
    [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Hull')!.click();
    game.frame(300);
    expect(lights(scene())).toContain('rim');
    expect(lights(scene()).length).toBeLessThanOrEqual(LIGHT_BUDGET);
  });

  it('keeps today\'s lights and no pool by default', async () => {
    const scene = catchScene();
    await boot('/?bot=off');
    expect(lights(scene()).length).toBeGreaterThan(LIGHT_BUDGET);
    expect(scene().getObjectByName('light pool')).toBeUndefined();
  });
});

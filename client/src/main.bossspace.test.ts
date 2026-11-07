// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { boot } from './test/harness';
import { BOSS_SPACE } from './bossspace';
import { NEON_LIGHT } from './neonlook';
import { TERRACE_LOOK } from './boardlook';

// A boss fight is drawn in its own space (#1551): the sun of its row of the table, on both looks, and the arena light on a page with no fight.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
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
const sun = (scene: THREE.Scene): THREE.DirectionalLight => scene.getObjectsByProperty('isDirectionalLight', true)[0] as THREE.DirectionalLight;
const fight = (name: string): void => {
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === name)!.click();
};

describe('main.ts boss spaces (#1551)', () => {
  for (const [look, arena] of [['', NEON_LIGHT.sun], ['&look=terrace', TERRACE_LOOK.sun]] as const) {
    it(`The Hull lights its fight with its own sun${look ? ' on the terrace look' : ''}, the page keeping the arena light before it`, async () => {
      const scene = catchScene();
      const game = await boot(`?bot=off${look}`, { reducedMotion: true });
      expect(sun(scene()).color.getHex()).toBe(arena);
      game.openModes();
      fight('The Hull');
      await vi.waitFor(() => expect(document.body.dataset.boss).toBe('hull'));
      expect(sun(scene()).color.getHex()).toBe(BOSS_SPACE.hull!.sun);
    });
  }
});

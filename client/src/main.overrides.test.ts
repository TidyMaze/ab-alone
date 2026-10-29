// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';

// A saved sceneoverrides.json (#875): the key's power over what lighttuning.ts tunes.
vi.mock('./sceneoverrides.json', () => ({ default: { power: { key: 0.7 } } }));

afterEach(() => vi.unstubAllEnvs());

const spyScene = (): { scene: () => THREE.Scene } => {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene) scene ??= this;
    return add.apply(this, objects);
  });
  return { scene: () => scene! };
};

describe('main.ts, the saved scene overrides (#875)', () => {
  it('applies them after the tuning, under the sliders\' levels (lights 215 %), on every deck', async () => {
    const { scene } = spyScene();
    const game = await boot('?bot=off');
    const key = (): number => (scene().getObjectByName('key') as THREE.Light).intensity;
    expect(key()).toBeCloseTo(0.7 * 2.15);
    game.hook('__setTier', 'low'); // the lights made again
    expect(key()).toBeCloseTo(0.7 * 2.15);
  });

  it('saves the panel through the dev server: the tuning behind the sliders, only what is off lighttuning.ts', async () => {
    await boot('?bot=off&lights');
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    document.querySelector<HTMLButtonElement>('#light-panel button[aria-label="Save to sceneoverrides.json"]')!.click();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(['/__sceneoverrides', 'POST']);
    const { power } = JSON.parse(init.body as string);
    expect(power.key).toBe(0.7); // 1.505 at 215 %, back to the file's 0.7
    expect(power.fill).toBeUndefined(); // the tuned power
  });

  it('has no Save button in the production build', async () => {
    vi.stubEnv('DEV', false);
    await boot('?bot=off&lights');
    expect(document.querySelector('#light-panel button[aria-label="Save to sceneoverrides.json"]')).toBeNull();
  });
});

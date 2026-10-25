// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';

// What the other main.*.test.ts files leave out of main.ts: a browser check asking for the next draw (#435), and a
// deck whose own texture set did not load (#401, #440).

describe('main.ts, __drawNext', () => {
  it('under automation, a draw asked for after a slow one waits 100 ms, not 4 times its cost', async () => {
    const game = await boot('?bot=off');
    const now = vi.mocked(performance.now);
    const clock = now.getMockImplementation()!;
    now.mockImplementation(() => clock() + 200); // the first draw takes 200 ms (the shaders compile)
    game.frame();
    now.mockImplementation(clock);
    expect(game.draws()).toBe(1);
    game.frame(100);
    expect(game.draws()).toBe(1); // a slow draw holds the next for 4 times its cost
    expect(game.hook('__drawNext')).toBe(1); // the draws so far
    game.frame(16); // 116 ms after the slow draw
    expect(game.draws()).toBe(2);
    expect(game.hook('__draws')).toBe(2);
    game.frame(16); // asked once only: back to every 100 ms
    expect(game.draws()).toBe(2);
  });
});

describe('main.ts, the deck textures', () => {
  type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** The material of the cells main.ts draws, caught when it adds them to its scene: call before boot. */
  function catchCells(): () => THREE.MeshStandardMaterial {
    let cell: Mesh | null = null;
    const add = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
      if (this instanceof THREE.Scene)
        cell ??= (objects.find((o) => o instanceof THREE.Mesh && o.geometry instanceof THREE.CylinderGeometry) as Mesh) ?? null;
      return add.apply(this, objects);
    });
    return () => cell!.material;
  }
  const name = (t: THREE.Texture | null): string | null => t?.name ?? null;

  it('the cells wear the Mess texture set when it loads', async () => {
    const cells = catchCells();
    await boot('?bot=off');
    await vi.waitFor(() => expect(document.body.dataset.deckSet).toBe('mess'));
    expect(name(cells().map)).toBe('deck-mess.png');
    expect(name(cells().normalMap)).toBe('deck-mess-normal.png');
  });

  it('without its own set, a deck keeps the shared steel albedo and no normal map', async () => {
    const cells = catchCells();
    const game = await boot('?bot=off', { missing: ['deck-mess.png', 'deck-mess-normal.png', 'deck-cargo.png'] });
    await vi.waitFor(() => expect(document.body.dataset.deckSet).toBe('steel'));
    expect(name(cells().map)).toBe('deck-albedo.png');
    expect(cells().normalMap).toBeNull();
    expect(name(cells().roughnessMap)).toBe('deck-roughness.png');
    game.hook('__deck', 'cargo'); // its normal map loads, its albedo does not: still no normal map to swap
    await vi.waitFor(() => expect(document.body.dataset.deck).toBe('cargo'));
    await game.settle();
    expect(document.body.dataset.deckSet).toBe('steel');
    expect(name(cells().map)).toBe('deck-albedo.png');
    expect(cells().normalMap).toBeNull();
  });
});

describe('main.ts, the airborne particles', () => {
  it('drift with their deck each frame, and one leaving the volume comes back inside it', async () => {
    let points: THREE.Points | null = null;
    const add = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
      points ??= (objects.find((o) => o instanceof THREE.Points) as THREE.Points) ?? null;
      return add.apply(this, objects);
    });
    const game = await boot('?bot=off', { webdriver: false });
    game.hook('__deck', 'furnace'); // steam, rising: drift [0.02, 0.12, -0.02]
    const pos = points!.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, 10, 7.45, 0); // just under the top of the volume
    pos.setXYZ(1, 10, 3, 0);
    game.frame(); // the first frame moves by 16 ms
    game.frame(100); // then by at most 80 ms
    expect(pos.getX(1)).toBeCloseTo(10 + 0.02 * 0.96);
    expect(pos.getY(1)).toBeCloseTo(3 + 0.12 * 0.96);
    expect(pos.getZ(1)).toBeCloseTo(-0.02 * 0.96);
    expect(pos.getY(0)).toBeLessThanOrEqual(6.7); // 7.45 + 0.115 left the top: back somewhere in the volume
    expect(pos.getY(0)).toBeGreaterThanOrEqual(-0.3);
    expect(Math.hypot(pos.getX(0), pos.getZ(0))).toBeGreaterThanOrEqual(5.5);
    expect(Math.hypot(pos.getX(0), pos.getZ(0))).toBeLessThanOrEqual(17);
    expect(pos.version).toBeGreaterThan(0); // sent to the GPU again
  });
});

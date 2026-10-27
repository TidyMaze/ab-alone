// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { BOARD_CELLS } from './board';
import { boot, type Game } from './test/harness';

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && this.name === 'abalone-scene') scene = this;
    else if (this instanceof THREE.Scene && !scene) scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => spy.mockRestore());
  return () => scene!;
}

function parts(scene: THREE.Scene) {
  const meshes = scene.children.filter((c): c is Mesh => c instanceof THREE.Mesh);
  const discs = meshes.filter((m) => m.geometry instanceof THREE.CylinderGeometry);
  const groups = scene.children.filter((c): c is THREE.Group => c instanceof THREE.Group);
  const marbles = groups.find((g) => g.name === 'marbles') ?? groups[4]!;
  return { discs, marbles };
}

describe('Stalker combat mode with fog of war (#784)', () => {
  it('toggles stalker submenu from the modes menu and launches vs bot', async () => {
    const scene = catchScene();
    const game = await boot('/?bot=off');

    const stalkerButton = document.getElementById('stalker-mode') as HTMLButtonElement;
    const stalkerList = document.getElementById('stalker-list') as HTMLDivElement;
    const stalkerBot = document.getElementById('stalker-bot') as HTMLButtonElement;

    expect(stalkerButton).not.toBeNull();
    expect(stalkerList.hidden).toBe(true);

    // Toggle menu
    stalkerButton.click();
    expect(stalkerList.hidden).toBe(false);
    expect(stalkerButton.getAttribute('aria-expanded')).toBe('true');

    // A second press closes it again, a third reopens it
    stalkerButton.click();
    expect(stalkerList.hidden).toBe(true);
    stalkerButton.click();
    expect(stalkerList.hidden).toBe(false);

    // Launch vs bot
    stalkerBot.click();
    expect(stalkerList.hidden).toBe(true);
    expect(document.body.dataset.stalker).toBe('1');
    expect(game.hook<boolean>('__stalker')).toBe(true);

    // Verify fog of war: discs outside vision range (distance > 2 from friendly marbles) are hidden
    const { discs } = parts(scene());
    const visibleDiscs = discs.filter((d) => d.visible);
    const hiddenDiscs = discs.filter((d) => !d.visible);

    // Standard starting position: black marbles are at the bottom rows
    // Not all 61 discs should be visible under fog of war
    expect(hiddenDiscs.length).toBeGreaterThan(0);
    expect(visibleDiscs.length).toBeGreaterThan(0);
    expect(visibleDiscs.length + hiddenDiscs.length).toBe(discs.length);
  });

  it('boots directly into stalker mode when requested via hash', async () => {
    const scene = catchScene();
    const game = await boot('/?bot=off#room=stalker-test-room&mode=stalker');

    expect(document.body.dataset.stalker).toBe('1');
    expect(game.hook<boolean>('__stalker')).toBe(true);

    const { discs } = parts(scene());
    const hiddenDiscs = discs.filter((d) => !d.visible);
    expect(hiddenDiscs.length).toBeGreaterThan(0);
  });

  it('creates an online stalker invite link when clicking stalker-online', async () => {
    catchScene();
    const game = await boot('/?bot=off');

    const stalkerButton = document.getElementById('stalker-mode') as HTMLButtonElement;
    const stalkerOnline = document.getElementById('stalker-online') as HTMLButtonElement;
    const inviteBox = document.getElementById('invite') as HTMLInputElement;

    stalkerButton.click();
    stalkerOnline.click();

    expect(document.body.dataset.stalker).toBe('1');
    expect(game.hook<boolean>('__stalker')).toBe(true);
    expect(inviteBox.hidden).toBe(false);
    expect(inviteBox.value).toContain('&mode=stalker');
    expect(location.hash).toContain('&mode=stalker');
  });
});

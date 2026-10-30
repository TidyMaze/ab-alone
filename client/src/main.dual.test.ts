// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { COLLAPSE_MS, DROP_MS, DUAL_AZIMUTH, type DualState } from './dual';
import { boot, type Game } from './test/harness';
import { COLLAPSE_AT, RETURN_AT, RETURN_CELL, SEED } from './test/dual-game';
import { dualGame } from './test/dual-fixture';

// The Dual Room on the harness (#947, game-design.md section 7.15): its two rooms side by side with the wall between
// them, the mark of an announced return, the returning marble dropping onto it, and the wall sinking at the 5th
// ejection. ?bot=off plays the recorded fight of the wasm tests through the __playMoves hook (fight seed 1).

type Shown = {
  state: DualState | null;
  wall: { visible: boolean; y: number; opacity: number };
  mark: [number, number] | null;
  drop: { cell: [number, number]; y: number } | null;
};
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const tell = (): string | null | undefined => byId('hud').querySelector('.boss .tell')?.textContent;
const dual = (game: Game) => game.hook<Shown>('__dual');
const named = (scene: THREE.Scene, name: string): THREE.Object3D[] => scene.getObjectsByProperty('name', name);
const played = (game: Game, from: number, to: number): number => game.hook<number>('__playMoves', dualGame().slice(from, to));

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

/** Starts the fight against The Dual Room from the mode menu, on the fixture's fight seed. */
function fightDual(game: Game): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(SEED);
    return a;
  });
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Dual Room')!.click();
}

describe('main.ts The Dual Room (#947)', () => {
  it('opens on its two rooms side by side, the wall standing between them, on the Mess deck', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off', { reducedMotion: true });
    expect(dual(game).state).toBeNull();
    expect(dual(game).wall.visible).toBe(false);
    fightDual(game);
    expect(game.hook('__fight')).toMatchObject({ id: 'dual', seed: SEED });
    expect(document.body.dataset.deck).toBe('mess');
    expect(game.hook<{ azimuth: number }>('__view').azimuth).toBeCloseTo(DUAL_AZIMUTH);
    expect(game.hook<{ radius: number; holes: number }>('__frame')).toMatchObject({ radius: 9, holes: 0 });
    expect(dual(game)).toEqual({
      state: { collapsed: false, coming: null },
      wall: { visible: true, y: 0, opacity: 1 },
      mark: null,
      drop: null,
    });
    expect(document.body.dataset.wall).toBe('up');
    expect(tell()).toBe('Ejected marbles come back in the other room · the wall falls at 5');
    expect(named(scene(), 'dual-wall')).toHaveLength(1);
  });

  it('marks the cell of an announced return, then drops the marble onto it', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off', { reducedMotion: false });
    fightDual(game);
    played(game, 0, RETURN_AT);
    for (let n = 0; n < 4; n++) game.frame(1000);
    expect(dual(game).mark).toEqual(RETURN_CELL);
    expect(named(scene(), 'return-mark')).toHaveLength(1);
    expect(tell()).toBe('Its marble comes back on the mark next turn · the wall falls at 5');
    played(game, RETURN_AT, RETURN_AT + 1);
    for (let n = 0; n < 3 && dual(game).drop === null; n++) game.frame(100); // the move's slide first
    const drop = dual(game).drop!;
    expect(drop.cell).toEqual(RETURN_CELL);
    expect(drop.y).toBeGreaterThan(0);
    expect(document.body.dataset.returns).toBe('1');
    game.frame(DROP_MS);
    game.frame(16);
    expect(dual(game).drop).toBeNull();
    expect(game.hook('__marbleTurn', ...RETURN_CELL)).not.toBeNull();
  });

  it('reduced motion: the returning marble is on its cell at once', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightDual(game);
    played(game, 0, RETURN_AT + 1);
    for (let n = 0; n < 4; n++) game.frame(16);
    expect(dual(game).drop).toBeNull();
    expect(document.body.dataset.returns).toBe('1');
    expect(game.hook('__marbleTurn', ...RETURN_CELL)).not.toBeNull();
  });

  it('the 5th ejection sinks the wall into the floor, then it is gone; Retry raises it again', async () => {
    const game = await boot('?bot=off', { reducedMotion: false });
    fightDual(game);
    played(game, 0, COLLAPSE_AT - 1);
    played(game, COLLAPSE_AT - 1, COLLAPSE_AT);
    for (let n = 0; n < 3 && document.body.dataset.wall !== 'falling'; n++) game.frame(100);
    expect(document.body.dataset.wall).toBe('falling');
    game.frame(COLLAPSE_MS / 2);
    const half = dual(game).wall;
    expect(half.visible).toBe(true);
    expect(half.y).toBeLessThan(0);
    expect(half.opacity).toBeLessThan(1);
    game.frame(COLLAPSE_MS);
    game.frame(16);
    expect(dual(game).wall.visible).toBe(false);
    expect(document.body.dataset.wall).toBe('down');
    expect(dual(game).state).toEqual({ collapsed: true, coming: null });
    expect(tell()).toBe('The wall is down, ejected marbles are gone');
    byId('boss-retry').click();
    expect(dual(game).wall).toEqual({ visible: true, y: 0, opacity: 1 });
    expect(document.body.dataset.wall).toBe('up');
  });

  it('reduced motion: the wall is gone at once', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightDual(game);
    played(game, 0, COLLAPSE_AT);
    game.frame(16);
    expect(dual(game).wall.visible).toBe(false);
    expect(document.body.dataset.wall).toBe('down');
  });

  it('another boss shows no wall and no mark', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightDual(game);
    game.openModes();
    byId('boss-fight').click();
    [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Echo')!.click();
    expect(dual(game)).toEqual({ state: null, wall: { visible: false, y: 0, opacity: 1 }, mark: null, drop: null });
    expect(document.body.dataset.wall).toBeUndefined();
  });
});

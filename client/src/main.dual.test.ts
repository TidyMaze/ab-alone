// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { COLLAPSE_MS, DROP_MS, DUAL_AZIMUTH, DUAL_POLAR, type DualState } from './dual';
import { BLOOD_MS } from './blood';
import { SLIDE_MS } from './slide';
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

/** Plays the first `to` plies of the recorded fight by clicks, as a player's page does without the test hooks; after
 * the last one the clock runs on until its slide is over. */
function clickPlies(game: Game, to: number): void {
  const DIRS = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
  for (const [k, record] of dualGame().slice(0, to).entries()) {
    const cells = Array.from({ length: record[0]! }, (_, i): [number, number] => [record[2 + 2 * i]!, record[3 + 2 * i]!]);
    const [dq, dr] = DIRS[record[1]!]!;
    // A target cell only this move reaches: a broadside's target can be another direction's too.
    const legal = game.hook<{ cells: [number, number][]; dir: number }[]>('__legal').filter(
      (m) => m.cells.length === cells.length && m.cells.every(([q, r]) => cells.some(([cq, cr]) => cq === q && cr === r)),
    );
    const reach = (dir: number): string[] => cells.map(([q, r]) => `${q + DIRS[dir]![0]!},${r + DIRS[dir]![1]!}`);
    const target = cells
      .map(([q, r]): [number, number] => [q + dq!, r + dr!])
      .find(([q, r]) => !cells.some(([cq, cr]) => cq === q && cr === r) && legal.every((m) => m.dir === record[1] || !reach(m.dir).includes(`${q},${r}`)))!;
    for (const [q, r] of cells) game.click(q, r);
    game.click(...target);
    expect(game.hook('__plies')).toBe(k + 1);
    if (k < to - 1) for (let n = 0; n < 4; n++) game.frame(1000);
  }
  for (let n = 0; n < 15; n++) game.frame(16); // the move's slide is over, its effects still run
  expect(document.body.dataset.sliding).not.toBe('1');
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
    expect(game.hook<{ azimuth: number; polar: number }>('__view')).toMatchObject({ azimuth: DUAL_AZIMUTH, polar: DUAL_POLAR });
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
    game.frame(DROP_MS / 2);
    game.frame(1);
    expect(dual(game).drop!.y).toBeGreaterThan(0);
    expect(dual(game).drop!.y).toBeLessThan(drop.y);
    game.frame(DROP_MS);
    game.frame(16);
    expect(dual(game).drop).toBeNull();
    expect(game.hook('__marbleTurn', ...RETURN_CELL)).not.toBeNull();
  });

  it('a Retry during the fall ends it on the new fight, whose cell is empty', async () => {
    const game = await boot('?bot=off', { reducedMotion: false });
    fightDual(game);
    played(game, 0, RETURN_AT + 1);
    expect(dual(game).drop).not.toBeNull();
    byId('boss-retry').click();
    game.frame(DROP_MS);
    game.frame(16);
    expect(dual(game).drop).toBeNull();
    expect(game.hook('__marbleTurn', ...RETURN_CELL)).toBeNull();
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
    expect(document.body.dataset.wall).toBe('falling');
    game.frame(SLIDE_MS / 2); // the push slides first, the wall stands till it is over
    expect(dual(game).wall).toEqual({ visible: true, y: 0, opacity: 1 });
    game.frame(SLIDE_MS); // the slide ends: the wall starts to fall
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

  it('the page of a player keeps drawing while the returning marble falls (#848)', async () => {
    const game = await boot('?bot=off&quality=low', { webdriver: false, reducedMotion: false }); // no dust drifting
    fightDual(game);
    clickPlies(game, RETURN_AT + 1);
    expect(dual(game).drop).not.toBeNull();
    const before = game.draws();
    for (let n = 0; n < 6; n++) game.frame(16);
    expect(game.draws() - before).toBe(6);
    expect(dual(game).drop).not.toBeNull();
  });

  it('the page of a player keeps drawing while the wall sinks (#848)', async () => {
    const game = await boot('?bot=off&quality=low', { webdriver: false, reducedMotion: false });
    fightDual(game);
    clickPlies(game, COLLAPSE_AT);
    // Past the push's slide, the ejection and its splash: the wall sinks alone, after the slide, longer than them.
    for (let elapsed = 15 * 16; elapsed <= BLOOD_MS; elapsed += 16) game.frame(16);
    expect(document.body.dataset.wall).toBe('falling');
    const before = game.draws();
    for (let n = 0; n < 6; n++) game.frame(16);
    expect(game.draws() - before).toBe(6);
    expect(document.body.dataset.wall).toBe('falling');
  });

  it('leaves no wall standing in the hub or the battle royale', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightDual(game);
    expect(dual(game).wall.visible).toBe(true);
    byId('ship').click();
    expect(dual(game).wall.visible).toBe(false);
    fightDual(game);
    expect(dual(game).wall.visible).toBe(true);
    game.openModes();
    byId('battle-royale').click();
    expect(dual(game).wall.visible).toBe(false);
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

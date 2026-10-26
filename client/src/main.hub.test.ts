// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { axialTo3D } from './board';
import { boot, type Game } from './test/harness';

// Walking the hub (docs/specs/game-design.md section 3.5, #521): the Ship entry of the mode menu draws the deck's map
// with the board's cells and the player's glass marble, which rolls one cell by a click on a neighbour or an arrow key.
// body[data-hub] names the deck and the cell of the marble, read by the e2e tests.

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

/** Catches the scene main.ts builds: call before boot. */
function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && this.name === 'abalone-scene') scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => spy.mockRestore());
  return () => scene!;
}

/** What the scene draws: the cell discs shown, and in the marbles group (the fifth group after the far rim, as
 * main.board.test.ts reads it) the glass marbles and the room glyphs. */
function drawn(scene: THREE.Scene) {
  const meshes = scene.children.filter((c): c is Mesh => c instanceof THREE.Mesh);
  const far = meshes.filter((m) => m.geometry instanceof THREE.ExtrudeGeometry)[2]!;
  const marbles = scene.children[scene.children.indexOf(far) + 4]!.children as Mesh[];
  return {
    discs: meshes.filter((m) => m.geometry instanceof THREE.CylinderGeometry && m.visible).length,
    glass: marbles.filter((m) => m.material instanceof THREE.MeshPhysicalMaterial),
    shells: marbles.filter((m) => m.geometry instanceof THREE.SphereGeometry && !(m.material instanceof THREE.MeshPhysicalMaterial)),
    glyphs: marbles.filter((m) => m.geometry instanceof THREE.TorusGeometry).length,
  };
}

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const hub = (): string | undefined => document.body.dataset.hub;
const saved = (): unknown => JSON.parse(localStorage.getItem('ab-alone.progress')!);
const press = (key: string, target: EventTarget = window): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
function ship(game: Game): void {
  game.openModes();
  byId('ship').click();
}

describe('main.ts, walking the hub (#521)', () => {
  it('Ship draws the Mess map, its room glyphs and the glass marble on the centre cell, in the HUD too', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    expect(drawn(scene()).discs).toBe(61);
    expect(document.body.dataset.rim).toBe('near');
    ship(game);
    expect(hub()).toBe('mess 0,0');
    expect(document.body.dataset.deck).toBe('mess');
    expect(byId('modes').getAttribute('aria-expanded')).toBe('false');
    expect(game.hook('__frame')).toMatchObject({ radius: 2, holes: 0 });
    expect(document.body.dataset.rim).toBe('off');
    const { discs, glass, shells, glyphs } = drawn(scene());
    expect(discs).toBe(19);
    expect(shells).toHaveLength(0);
    expect(glass).toHaveLength(1);
    expect(glass[0]!.position.toArray()).toEqual([0, 0.36, 0]);
    expect(glyphs).toBe(7); // six rooms and the lift up: the Mess has no lift down
    expect(game.hud()).toBe('Ship · Mess');
  });

  it('rolls the marble onto a clicked neighbour and saves it there, a far cell keeps it put', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    ship(game);
    game.click(1, 0);
    expect(hub()).toBe('mess 1,0');
    expect(saved()).toEqual({ version: 1, deck: 'mess', cell: [1, 0], beaten: [] });
    const p = axialTo3D(1, 0);
    expect(drawn(scene()).glass[0]!.position.toArray()).toEqual([p.x, 0.36, p.z]);
    game.click(-2, 0);
    expect(hub()).toBe('mess 1,0');
    game.click(2, 0);
    expect(hub()).toBe('mess 2,0');
    expect(game.hud()).toBe('Ship · MessBoss door');
  });

  it('rolls the marble by the arrow keys in the hub only, never from a text field', async () => {
    const game = await boot('?bot=off');
    expect(press('ArrowUp').defaultPrevented).toBe(false); // the board has no use for them
    expect(hub()).toBeUndefined();
    ship(game);
    expect(press('ArrowUp').defaultPrevented).toBe(true);
    expect(hub()).toBe('mess 1,-1');
    press('ArrowLeft');
    expect(hub()).toBe('mess 0,-1');
    expect(press('a').defaultPrevented).toBe(false);
    press('ArrowDown', byId<HTMLInputElement>('invite'));
    expect(hub()).toBe('mess 0,-1');
    press('ArrowUp'); // up to (0, -2), up again: off the map, the marble stays
    press('ArrowUp');
    expect(hub()).toBe('mess 0,-2');
  });

  it('opens on the saved spot, and an open lift carries the marble onto the lift back of the next deck', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    localStorage.setItem('ab-alone.progress', JSON.stringify({ version: 1, deck: 'mess', cell: [1, -1], beaten: ['echo'] }));
    ship(game);
    expect(hub()).toBe('mess 1,-1');
    press('ArrowUp');
    expect(hub()).toBe('cargo -1,2');
    expect(document.body.dataset.deck).toBe('cargo');
    expect(saved()).toEqual({ version: 1, deck: 'cargo', cell: [-1, 2], beaten: ['echo'] });
    expect(drawn(scene()).glyphs).toBe(8); // the two lifts
    expect(game.hud()).toBe('Ship · CargoLift to Mess');
    press('ArrowRight');
    expect(hub()).toBe('cargo 0,2');
    expect(document.body.dataset.deck).toBe('cargo');
  });

  it('draws no ghost for a hovered cell in the hub', async () => {
    const game = await boot('?bot=off');
    ship(game);
    const { x, y } = game.hook<{ x: number; y: number }>('__cellToScreen', 1, 0);
    delete document.body.dataset.ghosts; // set by every ghost drawing
    document.querySelector('body > canvas')!.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
    expect(document.body.dataset.ghosts).toBeUndefined();
  });

  it('leaves the hub for the board when a new game, a boss fight or Play online starts', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    localStorage.setItem('ab-alone.progress', JSON.stringify({ version: 1, deck: 'cargo', cell: [0, 0], beaten: ['echo'] }));
    ship(game);
    expect(document.body.dataset.deck).toBe('cargo');
    byId('new-game').click();
    expect(hub()).toBeUndefined();
    expect(document.body.dataset.deck).toBe('mess');
    expect(drawn(scene()).discs).toBe(61);
    expect(game.hook('__frame')).toMatchObject({ radius: 4 });

    ship(game);
    game.openModes();
    byId('boss-fight').click();
    (byId('boss-list').children[1] as HTMLButtonElement).click();
    expect(hub()).toBeUndefined();
    expect(document.body.dataset.deck).toBe('cargo');
    expect(drawn(scene()).discs).toBe(61);

    ship(game);
    game.openModes();
    byId('play-online').click();
    await game.settle();
    expect(hub()).toBeUndefined();
    ship(game); // no ship while online
    expect(hub()).toBeUndefined();
  });

  it('puts the end light of a finished game out in the hub', async () => {
    const game = await boot('?nodes=100');
    await game.hook<Promise<number>>('__playTurns', 30, [4]); // the player marches one way, the bot pushes six off
    expect(document.body.dataset.over).toBe('loss');
    ship(game);
    expect(document.body.dataset.over).toBeUndefined();
    expect(game.hud()).toBe('Ship · Mess');
  });
});

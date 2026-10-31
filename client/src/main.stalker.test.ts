// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Axial } from './board';
import { SLIDE_MS } from './slide';
import { IDBFactory } from 'fake-indexeddb';
import { boot, type Game } from './test/harness';
import { BLOCKED, HIDDEN, PLIES, SEEN } from './test/stalker-game';

// Stalker against the bot on the harness (#998, game-design.md section 3.8): the mode menu entry, the fog (hidden
// enemy marbles not drawn, off-range cells dark), the move a hidden marble blocks, and the enemy's last move. The
// position comes from the __playMoves hook (src/test/stalker-game.ts).

type Shown = { visible: Axial[]; drawn: Axial[]; revealed: Axial[]; last: Axial[] } | null;
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const shown = (game: Game): Shown => game.hook<Shown>('__stalker');
const drawnAt = (game: Game, [q, r]: Axial): boolean => game.hook('__marbleTurn', q, r) !== null;
const has = (cells: Axial[], [q, r]: Axial): boolean => cells.some(([cq, cr]) => cq === q && cr === r);
const named = (scene: THREE.Scene, name: string): THREE.Object3D[] => scene.getObjectsByProperty('name', name);
const NOTE = 'Stalker: the bot is not fogged';

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

/** Plays the recorded plies by the hook, and runs the clock past the last one's slide: a click waits for it. */
function playPlies(game: Game, plies: number[][]): void {
  game.hook('__playMoves', plies);
  game.frame(SLIDE_MS + 1);
}

function startStalker(game: Game): void {
  game.openModes();
  byId('stalker').click();
}

describe('main.ts Stalker (#998)', () => {
  it('is still fogged after a reload: the save remembers the Stalker game (#1009)', async () => {
    const indexedDB = new IDBFactory();
    const first = await boot('/', { indexedDB });
    startStalker(first);
    const move = first.hook<{ cells: Axial[]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    first.click(...move.cells[0]!); // a real move, so the game is saved (the __playMoves hook saves nothing)
    first.click(...first.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
    first.frame(SLIDE_MS + 1);
    await first.settle();
    const plies = first.hook<number>('__plies');
    expect(plies).toBeGreaterThan(0);
    expect(shown(first)).not.toBeNull();
    const again = await boot('/', { indexedDB });
    expect(again.hook('__plies')).toBe(plies); // the same game, not the Ship
    expect(shown(again)).not.toBeNull();
    expect(again.hud()).toContain(NOTE);
  });

  it('starts against the bot from the mode menu: the HUD says the bot is not fogged, the cells out of range are dark', async () => {
    const scene = catchScene();
    const game = await boot('/');
    expect(shown(game)).toBeNull();
    startStalker(game);
    expect(byId('mode-menu').hidden).toBe(true);
    expect(game.hud()).toContain(NOTE);
    const start = shown(game)!;
    expect(start.visible).toHaveLength(31);
    expect(start.drawn).toEqual([]); // White is 4 cells away from every Black marble
    expect(drawnAt(game, [0, -2])).toBe(false);
    expect(byId('hud').querySelector('small')!.textContent).toBe(NOTE); // the only note, no stray separator
    const [fog] = named(scene(), 'stalker-fog') as THREE.InstancedMesh[];
    expect(fog!.count).toBe(61 - 31);
    playPlies(game, PLIES); // a second refresh draws the same veil again, with its own count: no new mesh for the GPU
    expect(named(scene(), 'stalker-fog')).toEqual([fog]);
    expect(fog!.count).toBe(61 - 39);
  });

  it('turns the evaluation bar and the Hint off for good, as a boss fight does: they search the whole board', async () => {
    const game = await boot('/?bot=on');
    expect(byId('eval').hidden).toBe(false);
    startStalker(game);
    expect(byId('eval').hidden).toBe(true);
    expect(byId('hint').hidden).toBe(true);
  });

  it("greys Auto-play with its reason: the bot would play the player's side seeing the hidden marbles", async () => {
    const game = await boot('/?bot=on');
    startStalker(game);
    expect(byId<HTMLButtonElement>('auto-play').hidden).toBe(false);
    expect(byId<HTMLButtonElement>('auto-play').disabled).toBe(true);
    expect(byId('auto-reason').textContent).toBe('Not in a Stalker game');
  });

  it('draws an enemy marble 2 cells away and not one 3 cells away', async () => {
    const game = await boot('/');
    startStalker(game);
    playPlies(game, PLIES);
    const s = shown(game)!;
    expect(s.visible).toHaveLength(39);
    expect(has(s.drawn, SEEN)).toBe(true);
    expect(has(s.drawn, HIDDEN)).toBe(false);
    expect(drawnAt(game, SEEN)).toBe(true);
    expect(drawnAt(game, HIDDEN)).toBe(false);
  });

  it('offers a move a hidden marble blocks, with its ghosts; playing it reveals the marble and the player plays again', async () => {
    const game = await boot('/');
    startStalker(game);
    playPlies(game, PLIES);
    for (const [q, r] of BLOCKED.cells) game.click(q, r);
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })); // north-east
    expect(document.body.dataset.ghosts).toBe('2'); // the head of the line, and the last seen marble pushed onto a hidden cell
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(game.hook('__plies')).toBe(4);
    expect(shown(game)!.revealed).toEqual([HIDDEN]);
    expect(drawnAt(game, HIDDEN)).toBe(true);
    expect(game.hud()).toContain('A hidden marble blocks that move: play again');
    expect(game.hook('__rings')).toEqual([]); // the selection is gone
    game.click(-3, 2);
    game.click(-3, 1); // north-west, an empty cell
    expect(game.hook('__plies')).toBe(5);
    game.frame(SLIDE_MS + 1);
    expect(shown(game)!.revealed).toEqual([]);
    expect(game.hud()).not.toContain('A hidden marble');
  });

  it("rings the enemy's last move where it landed in range, for one turn", async () => {
    const scene = catchScene();
    const game = await boot('/');
    startStalker(game);
    playPlies(game, PLIES.slice(0, 2)); // White's (0,-3) and (0,-2) to (0,-2) and (0,-1): (0,-2) is 3 away
    expect(shown(game)!.last).toEqual([[0, -1]]);
    expect(named(scene(), 'stalker-last')).toHaveLength(1);
    playPlies(game, PLIES.slice(2, 3)); // Black's move: the ring is gone
    expect(shown(game)!.last).toEqual([]);
  });

  it('fogs a replayed position by its own visible set, without the live reveal and last move', async () => {
    const game = await boot('/');
    startStalker(game);
    playPlies(game, PLIES.slice(0, 2));
    byId('replay').click();
    byId('replay-first').click();
    expect(shown(game)!.visible).toHaveLength(31);
    expect(shown(game)!.last).toEqual([]);
  });

  it('New game stays in Stalker, another mode leaves it', async () => {
    const game = await boot('/');
    startStalker(game);
    byId('new-game').click();
    expect(game.hud()).toContain(NOTE);
    expect(shown(game)).not.toBeNull();
    game.openModes();
    byId('daily').click();
    expect(game.hud()).not.toContain(NOTE);
    expect(shown(game)).toBeNull();
  });
});

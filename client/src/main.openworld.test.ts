// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { indexedDbStore } from './idb';
import { GLIDE_MS } from './openworldglide';
import { OPEN_WORLD_POINT_LIGHTS } from './quality';
import { SLIDE_MS } from './slide';
import { boot, type Game } from './test/harness';

// The Open world mode (#962, docs/specs/openworld.md): its entry is in the mode menu for everyone (#1000), ?openworld=<seed>
// fixes the seed, it draws its own scene in place of the board's, and body[data-openworld] and [data-openworld-at] name
// the seed and the hero's cell, read by the e2e tests.

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const data = () => document.body.dataset; // the page swaps the body at each boot
const press = (key: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

// The menu's click reads the saved world first: IndexedDB answers in a few tasks.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
};

const release = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
};

// The test hooks of the Open world, on a webdriver page only (docs/specs/openworld.md section 6).
type Cells = [number, number][];
type Hooks = { __openworldFixture?: (f: { hero: [number, number]; troop: Cells; enemies: Cells }) => void; __openworldEnemies?: () => Cells; __openworldCamera?: () => { zoom: number; shake: number; centre: number[]; reach: number } };
const hooks = () => window as unknown as Hooks;

describe('the Open world mode', () => {
  it('the troop pushes the enemy in front of it after a step, through the engine: the hero, the troop and the enemy move, #967', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    hooks().__openworldFixture!({ hero: [0, 0], troop: [[-1, 0], [-2, 0]], enemies: [[2, 0]] });
    press('ArrowRight'); // the hero rolls onto (1,0): the line (1,0), (0,0), (-1,0) pushes the enemy (2,0) on to (3,0)
    expect(data().openworldAt).toBe('2,0');
    expect(data().openworldPush).toBe('1');
    expect(data().openworldTroop).toBe('1,0 0,0 -2,0');
    expect(hooks().__openworldEnemies!()).toEqual([[3, 0]]);
  });

  it('reads what the camera draws through a test hook, at rest: the shake is 0, #1103', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    const camera = hooks().__openworldCamera!();
    expect(camera.shake).toBe(0);
    expect(camera.zoom).toBeGreaterThan(0);
    expect(camera.centre).toHaveLength(2);
  });

  it('counts the point lights of the scene it draws: none in the Open world, within the budget (#1234)', async () => {
    const game = await boot('?bot=off&openworld=7');
    const cost = () => (window as unknown as { __renderCost: { pointLights: number } }).__renderCost;
    expect(cost().pointLights).toBeGreaterThan(OPEN_WORLD_POINT_LIGHTS);
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(cost().pointLights).toBeLessThanOrEqual(OPEN_WORLD_POINT_LIGHTS);
  });

  it('exposes no test hook on a page that is not a webdriver one', async () => {
    delete hooks().__openworldFixture;
    await boot('?bot=off&openworld=7', { webdriver: false });
    expect(hooks().__openworldFixture).toBeUndefined();
  });

  it('is in the mode menu without any parameter, and a click enters a world with a random seed', async () => {
    const game = await boot('?bot=off');
    expect(byId('openworld').hidden).toBe(false);
    expect(press('Escape').defaultPrevented).toBe(false); // not on: the keys are the page's
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(data().openworld).toMatch(/^\d+$/);
    expect(data().openworldAt).toBe('0,0');
  });

  it('enters a world by its seed, rolls the hero by the arrow keys, and leaves on Escape', async () => {
    const game = await boot('?bot=off&openworld=7');
    expect(byId('openworld').hidden).toBe(false);
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(data().openworld).toBe('7');
    expect(data().openworldAt).toBe('0,0');
    await game.settle(); // the models load: none on the empty scene of the harness
    game.frame();
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(data().openworldAt).toBe('1,0');
    expect(press('a').defaultPrevented).toBe(false);
    byId('openworld').ownerDocument.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('resize'));
    game.frame();
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(data().openworld).toBeUndefined();
    expect(game.hud()).toContain('to move'); // the board's plate is back
  });

  it('rolls the hero by a press on the screen, and keeps the board out of it', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    document.querySelector('canvas')!.dispatchEvent(new MouseEvent('pointerdown', { clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true }));
    expect(data().openworldAt).toBe('0,0'); // the centre is the hero's own cell
  });

  it('takes a world of its own when no seed is given, and keeps the hub keys out while it is on', async () => {
    const game = await boot('?bot=off&openworld');
    game.openModes();
    byId('ship').click();
    const hub = data().hub;
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(Number(data().openworld)).toBeGreaterThan(0);
    press('ArrowRight');
    expect(data().hub).toBe(hub); // the hub's marble did not roll
    expect(data().openworldAt).toBe('1,0');
  });

  it('rolls the hero on the diagonal while a vertical and a horizontal arrow are held, and lets go on keyup or blur, #977', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    press('ArrowLeft'); // (-1, 0)
    press('ArrowUp'); // Left and Up held: up-left on the next step of the cadence (#1059)
    game.frame(GLIDE_MS);
    expect(data().openworldAt).toBe('-1,-1');
    release('ArrowLeft');
    game.frame(GLIDE_MS); // Left let go: a single Up, (-1, -2)
    expect(data().openworldAt).toBe('-1,-2');
    window.dispatchEvent(new Event('blur')); // the window loses focus: nothing is held any more
    press('ArrowRight'); // single, not up-right with the Up still held: (0, -2)
    expect(data().openworldAt).toBe('0,-2');
  });

  it('steps an arrow at its keydown, ignores the key repeat, and walks on the frames while it is held, #1059', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    await game.settle();
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(data().openworldAt).toBe('1,0'); // the first step, on the keydown
    const repeat = new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true });
    window.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true); // no page scroll on the repeat either
    expect(data().openworldAt).toBe('1,0'); // and no step
    game.frame(GLIDE_MS);
    expect(data().openworldAt).toBe('2,0'); // the cadence of the held arrow
    release('ArrowRight');
    game.frame(GLIDE_MS);
    expect(data().openworldAt).toBe('2,0'); // let go: no more steps
  });

  it('turns the Open world camera with a right-button drag and with a twist of two fingers, and shows no menu over it, #1026', async () => {
    const game = await boot('?bot=off&openworld=7');
    const canvas = document.querySelector('canvas')!;
    const menu = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false); // not the Open world: the board keeps its menu
    game.openModes();
    byId('openworld').click();
    await settle();
    const at = (type: string, id: number, x: number, y: number, button = 0) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      canvas.dispatchEvent(e);
    };
    const yawOf = () => Number(data().openworldYaw);
    at('pointerdown', 5, 300, 300, 2); // the right button turns the camera, it does not roll the hero
    expect(data().openworldAt).toBe('0,0');
    at('pointermove', 5, 340, 300, 2); // 40 px to the right: 20 degrees
    expect(yawOf()).toBe(20);
    at('pointerup', 5, 340, 300, 2);
    at('pointermove', 5, 360, 300, 2); // released: no turn
    expect(yawOf()).toBe(20);
    const shown = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    canvas.dispatchEvent(shown);
    expect(shown.defaultPrevented).toBe(true);
    at('pointerdown', 6, 600, 300);
    at('pointerdown', 7, 700, 300); // two fingers, a quarter turn of the pair
    at('pointermove', 7, 700, 400); // from 0 to 45 degrees
    expect(yawOf()).toBe(65);
    at('pointerup', 6, 600, 300);
    at('pointerup', 7, 700, 400);
  });

  it('zooms the Open world out with the wheel and with a pinch, #976', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    const canvas = document.querySelector('canvas')!;
    const zoomOf = () => Number(data().openworldZoom);
    const wheel = (deltaY: number) => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
    const finger = (type: string, id: number, x: number) => {
      const e = new MouseEvent(type, { clientX: x, clientY: 300, bubbles: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      canvas.dispatchEvent(e);
    };
    wheel(1000);
    expect(zoomOf()).toBeGreaterThan(2.5); // far out, still the 3D view
    wheel(-1000);
    expect(zoomOf()).toBe(1);
    finger('pointermove', 9, 100); // a hover, no finger down: nothing
    finger('pointerdown', 1, 300);
    finger('pointermove', 1, 300); // one finger moves, not apart: nothing
    expect(zoomOf()).toBe(1);
    finger('pointerdown', 2, 700); // two fingers 400 apart
    finger('pointermove', 2, 500); // 200 apart: the camera goes back
    expect(zoomOf()).toBe(2);
    finger('pointermove', 2, 700); // 400 apart again: closer
    expect(zoomOf()).toBe(1);
    finger('pointerup', 1, 300);
    finger('pointerup', 2, 700);
  });

  // The save of the Open world (#968): the menu resumes the last world played, a seed in the URL resumes its own, `new` starts afresh.
  const openFrom = async (url: string, indexedDB: IDBFactory) => {
    const game = await boot(url, { indexedDB });
    game.openModes();
    byId('openworld').click();
    await settle();
    return game;
  };

  it('the menu entry resumes the last world played: its seed, the hero where it was left', async () => {
    const idb = new IDBFactory();
    const game = await openFrom('?bot=off', idb);
    const seed = data().openworld!;
    press('ArrowRight'); // the hero rolls to (1,0)
    game.frame();
    await settle();
    expect(data().openworldSaved).toBe('1');
    await openFrom('?bot=off', idb);
    expect(data().openworld).toBe(seed);
    expect(data().openworldAt).toBe('1,0');
  });

  it('the menu entry opens a new random world when the last one has no save of its own', async () => {
    const idb = new IDBFactory();
    const game = await openFrom('?bot=off&openworld=7', idb);
    press('ArrowRight');
    game.frame();
    await settle();
    await indexedDbStore().delete('openworld:7');
    await openFrom('?bot=off', idb);
    expect(data().openworld).not.toBe('7');
    expect(data().openworldAt).toBe('0,0');
  });

  it('a seed in the URL resumes its own save', async () => {
    const idb = new IDBFactory();
    const game = await openFrom('?bot=off&openworld=7', idb);
    press('ArrowRight');
    game.frame();
    await settle();
    await openFrom('?bot=off&openworld=7', idb);
    expect(data().openworld).toBe('7');
    expect(data().openworldAt).toBe('1,0');
  });

  it('?openworld=new starts a fresh random world, although a last world is saved', async () => {
    const idb = new IDBFactory();
    const game = await openFrom('?bot=off', idb);
    const seed = data().openworld!;
    press('ArrowRight');
    game.frame();
    await settle();
    await openFrom('?bot=off&openworld=new', idb);
    expect(data().openworld).not.toBe(seed);
    expect(data().openworldAt).toBe('0,0');
  });

  it('counts the frames really drawn in its FPS readout: 50 FPS at 20 ms a frame, #1064', async () => {
    const game = await boot('?bot=off&openworld=7');
    byId('setting-fps').click();
    game.openModes();
    byId('openworld').click();
    await settle();
    await game.settle();
    game.frame(20); // the first draw
    press('ArrowRight'); // a glide: every frame draws
    release('ArrowRight');
    for (let i = 0; i < 6; i++) game.frame(20);
    expect(byId('fps').textContent).toBe('50 FPS');
  });

  it('reads idle in its FPS readout when a still scene draws nothing, and the diagnostics follow, #1064', async () => {
    const game = await boot('?bot=off&openworld=7', { reducedMotion: true }); // no water to animate: a still scene draws once
    byId('setting-fps').click();
    game.openModes();
    byId('openworld').click();
    await settle();
    await game.settle();
    for (let i = 0; i < 40; i++) game.frame(20);
    expect(byId('fps').textContent).toBe('idle');
    press('ArrowRight');
    release('ArrowRight');
    for (let i = 0; i < 3; i++) game.frame(20); // a step and nothing after it
    expect(byId('fps').textContent).toBe('idle');
    byId('copy-diagnostics').click();
    await game.settle();
    expect(JSON.parse(byId<HTMLTextAreaElement>('diagnostics').value).environment.fps).toBe(0);
  });
});

// The board's keys in the Open world (#1063): none reaches the board game, its replay, its selection or its moves, and
// leaving the world gives the board back as it was.
describe('the board keys in the Open world, #1063', () => {
  const canvasKey = (key: string): void => {
    document.querySelector('canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };
  /** Two plies by two clicks each, the slides let go. */
  const playTwo = (game: Game): void => {
    for (let i = 0; i < 2; i++) {
      const mv = game.hook<{ cells: Axial[]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
      game.click(...mv.cells[0]!);
      const target = game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!;
      game.click(...target.cell);
      game.frame(SLIDE_MS);
    }
  };
  const enterWorld = async (game: Game): Promise<void> => {
    game.openModes();
    byId('openworld').click();
    await settle();
    await game.settle();
  };

  it('the arrows roll the hero and do not open the replay of the board', async () => {
    const game = await boot('?bot=off&openworld=7');
    playTwo(game);
    const turn = game.turn();
    await enterWorld(game);
    press('ArrowLeft');
    expect(data().openworldAt).toBe('-1,0');
    expect(byId('replay-bar').hidden).toBe(true);
    expect(game.turn()).toBe(turn);
    expect(game.hook('__plies')).toBe(2);
  });

  it('the board selection and moves ignore Tab, Q, E, A, S, D, Enter on the focused canvas', async () => {
    const game = await boot('?bot=off&openworld=7');
    await enterWorld(game);
    document.querySelector('canvas')!.focus();
    canvasKey('Tab');
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
    for (const key of ['q', 'e', 'a', 's', 'd', 'Enter']) canvasKey(key);
    expect(data().ghosts).not.toBe('1');
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
    expect(game.hook('__plies')).toBe(0);
  });

  it('a replay open before the Open world stays as it was when the world is left', async () => {
    const game = await boot('?bot=off&openworld=7');
    playTwo(game);
    byId('replay').click();
    byId('replay-prev').click();
    const shown = byId('replay-label').textContent;
    await enterWorld(game);
    press('ArrowRight'); // the Open world's arrow: the board's replay does not step
    press('Escape'); // leaves the Open world: Escape is not the board's Live
    expect(data().openworld).toBeUndefined();
    expect(byId('replay-label').textContent).toBe(shown);
    expect(byId('replay-bar').hidden).toBe(false);
  });

  it('the board takes its keys back once the Open world is left', async () => {
    const game = await boot('?bot=off&openworld=7');
    await enterWorld(game);
    press('Escape');
    expect(data().openworld).toBeUndefined();
    document.querySelector('canvas')!.focus();
    canvasKey('Tab');
    expect(game.hook<Axial[]>('__rings').length).toBeGreaterThan(0);
  });

  it('the Steering setting is on by default, names the mode in the HUD, and flips, #1137', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    const row = byId('setting-steering');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(byId('openworld-mode').textContent).toContain('Steering on');
    row.click();
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect(byId('openworld-mode').textContent).toContain('Steering off');
    row.click();
    expect(byId('openworld-mode').textContent).toContain('Steering on');
  });

  it('a drag of the camera ends a walk to a far cell without error, #1137', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    const canvas = document.querySelector('canvas')!;
    const at = (type: string, id: number, x: number, y: number, button = 0) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      canvas.dispatchEvent(e);
    };
    at('pointerdown', 5, 300, 300, 2);
    at('pointermove', 5, 340, 300, 2);
    expect(data().openworldRoute).toBe('0');
    at('pointerup', 5, 340, 300, 2);
  });
});

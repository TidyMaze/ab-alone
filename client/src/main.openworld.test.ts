// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';

// The Open world mode (#962, docs/specs/openworld.md): its entry is in the mode menu only with ?openworld, it draws its
// own scene in place of the board's, and body[data-openworld] and [data-openworld-at] name the seed and the hero's cell,
// read by the e2e tests.

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const data = () => document.body.dataset; // the page swaps the body at each boot
const press = (key: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

const release = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
};

describe('the Open world mode', () => {
  it('is in the mode menu only when the page asks for it', async () => {
    await boot('?bot=off');
    expect(byId('openworld').hidden).toBe(true);
    expect(press('Escape').defaultPrevented).toBe(false); // not on: the keys are the page's
  });

  it('enters a world by its seed, rolls the hero by the arrow keys, and leaves on Escape', async () => {
    const game = await boot('?bot=off&openworld=7');
    expect(byId('openworld').hidden).toBe(false);
    game.openModes();
    byId('openworld').click();
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
    expect(Number(data().openworld)).toBeGreaterThan(0);
    press('ArrowRight');
    expect(data().hub).toBe(hub); // the hub's marble did not roll
    expect(data().openworldAt).toBe('1,0');
  });

  it('rolls the hero on the diagonal while a vertical and a horizontal arrow are held, and lets go on keyup or blur, #977', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    press('ArrowLeft'); // (-1, 0)
    press('ArrowUp'); // Left and Up held: up-left
    expect(data().openworldAt).toBe('-1,-1');
    release('ArrowLeft');
    press('ArrowUp'); // Left let go: a single Up, (-1, -2)
    expect(data().openworldAt).toBe('-1,-2');
    window.dispatchEvent(new Event('blur')); // the window loses focus: nothing is held any more
    press('ArrowRight'); // single, not up-right with the Up still held: (0, -2)
    expect(data().openworldAt).toBe('0,-2');
  });

  it('zooms the Open world out with the wheel and with a pinch, #976', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    const canvas = document.querySelector('canvas')!;
    const zoomOf = () => Number(data().openworldZoom);
    const wheel = (deltaY: number) => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
    const finger = (type: string, id: number, x: number) => {
      const e = new MouseEvent(type, { clientX: x, clientY: 300, bubbles: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      canvas.dispatchEvent(e);
    };
    wheel(1000);
    expect(zoomOf()).toBeGreaterThan(2.5); // past the close range: the overview
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
});

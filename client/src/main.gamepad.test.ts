// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { REPEAT_DELAY } from './gamepad';
import { boot, type Game } from './test/harness';

// The gamepad on main.ts (#1252): it drives the keyboard's paths, the focus walk of the menus and the board's keys.

type Move = { cells: Axial[]; dir: number };
const A = 0, B = 1, LB = 4, RB = 5, RT = 7, START = 9, DOWN = 13, LEFT = 14, RIGHT = 15;
const canvas = (): HTMLCanvasElement => document.querySelector('canvas')!;
const rings = (game: Game): Axial[] => game.hook<Axial[]>('__rings');
const plies = (game: Game): number => game.hook<number>('__plies');
const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** A fake pad of the standard layout; `hold` sets what is held from the next frame on, `tap` presses and releases. */
function plugPad(game: Game): { hold: (buttons: number[], axes?: number[], values?: Record<number, number>) => void; tap: (button: number) => void; unplug: () => void } {
  let pads: unknown[] = [];
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
  const hold = (buttons: number[], axes = [0, 0, 0, 0], values: Record<number, number> = {}): void => {
    const pressed = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: values[i] ?? (buttons.includes(i) ? 1 : 0) }));
    pads = [{ connected: true, mapping: 'standard', axes, buttons: pressed }];
    game.frame();
  };
  return {
    hold,
    tap: (button) => {
      hold([button]);
      hold([]);
    },
    unplug: () => {
      pads = [];
      game.frame();
      Reflect.deleteProperty(navigator, 'getGamepads');
    },
  };
}

describe('the gamepad', () => {
  it('Start opens the settings menu and gives the focus to its button, B closes it', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    pad.tap(START);
    expect(byId('settings-menu').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('settings'));
    pad.tap(B);
    expect(byId('settings-menu').hidden).toBe(true);
    pad.unplug();
  });

  it('the D-pad walks the focus off the board, A presses the focused button', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    byId('hud-fold').focus();
    pad.tap(DOWN);
    expect(document.activeElement).not.toBe(byId('hud-fold'));
    pad.tap(LEFT); // back
    expect(document.activeElement).toBe(byId('hud-fold'));
    pad.tap(RB); // off the board, RB and LB walk the focus as Tab and Shift+Tab
    expect(document.activeElement).not.toBe(byId('hud-fold'));
    pad.tap(LB);
    expect(document.activeElement).toBe(byId('hud-fold'));
    pad.tap(A);
    expect(byId('hud-fold').getAttribute('aria-expanded')).toBe('false');
    pad.unplug();
  });

  it('on the board RB selects a group, the stick picks its direction, A plays it; the hints name the pad', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    canvas().focus();
    pad.tap(RB);
    expect(game.hud()).toContain('group 1 of');
    expect(game.hud()).toContain('LB RB to switch');
    expect(document.body.dataset.pad).toBe('');
    const mv = game.hook<Move[]>('__legal').find((m) => m.cells.join() === rings(game).join())!;
    const angle = [0, 180, 60, 240, 120, 300][mv.dir]! * (Math.PI / 180);
    pad.hold([], [Math.cos(angle), -Math.sin(angle), 0, 0]);
    pad.hold([]);
    expect(game.hud()).toContain('A to play');
    pad.tap(A);
    expect(plies(game)).toBe(1);
    pad.unplug();
  });

  it('RB past the last group leaves the board for the next control, as Tab does', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    canvas().focus();
    for (let i = 0; i < 60 && document.activeElement === canvas(); i++) pad.tap(RB);
    expect(document.activeElement).not.toBe(canvas());
    expect(rings(game)).toEqual([]);
    pad.unplug();
  });

  it('B backs out of the direction on the board, the D-pad aims there', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    canvas().focus();
    pad.tap(RB);
    pad.tap(RIGHT);
    expect(game.hud()).toMatch(/east/);
    pad.tap(B);
    expect(game.hud()).not.toMatch(/east/);
    expect(rings(game).length).toBeGreaterThan(0);
    pad.unplug();
  });

  it('a key press or a mouse move gives the keyboard hints back', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    canvas().focus();
    pad.tap(RB);
    canvas().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.body.dataset.pad).toBeUndefined();
    expect(game.hud()).not.toContain('LB RB');
    pad.tap(RB);
    expect(document.body.dataset.pad).toBe('');
    dispatchEvent(new MouseEvent('mousemove'));
    expect(document.body.dataset.pad).toBeUndefined();
    pad.unplug();
  });

  it('the right stick orbits the camera, the right trigger zooms in', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    const before = game.hook<{ azimuth: number; distance: number }>('__view');
    pad.hold([], [0, 0, 1, 0]);
    pad.hold([], [0, 0, 1, 0]);
    expect(game.hook<{ azimuth: number }>('__view').azimuth).not.toBe(before.azimuth);
    pad.hold([], undefined, { [RT]: 1 });
    expect(game.hook<{ distance: number }>('__view').distance).toBeLessThan(before.distance);
    pad.unplug();
  });

  it('a pad that disconnects while held changes nothing', async () => {
    const game = await boot('?bot=off');
    const pad = plugPad(game);
    canvas().focus();
    pad.hold([RB]);
    const held = rings(game);
    pad.unplug();
    game.frame(REPEAT_DELAY);
    expect(rings(game)).toEqual(held);
    expect(plies(game)).toBe(0);
  });
});

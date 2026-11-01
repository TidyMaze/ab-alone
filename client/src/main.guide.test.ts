// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot, type Game } from './test/harness';

// The first-launch guide on main.ts (#1293): a dialog of five pages over the game, closed for good by Skip or the end,
// opened again from the settings menu.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const guide = (): HTMLElement => byId('guide');
const title = (): string => byId('guide-title').textContent!;
const next = (): HTMLButtonElement => byId('guide-next') as HTMLButtonElement;
const back = (): HTMLButtonElement => byId('guide-back') as HTMLButtonElement;
const key = (target: Element, k: string, shiftKey = false): boolean =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

function plugPad(game: Game): (button: number) => void {
  let pads: unknown[] = [];
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
  const hold = (buttons: number[]): void => {
    const pressed = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
    pads = [{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: pressed }];
    game.frame();
  };
  return (button) => {
    hold([button]);
    hold([]);
  };
}

describe('the first-launch guide', () => {
  it('opens on a first launch on its first page, Next walks it to the last, whose Play closes it for good', async () => {
    await boot('?bot=off', { webdriver: false });
    expect(guide().hidden).toBe(false);
    expect(guide().getAttribute('role')).toBe('dialog');
    expect(title()).toBe('Push them into the void');
    expect(byId('guide-count').textContent).toBe('1 / 5');
    expect(byId('guide-art').querySelector('svg')).not.toBeNull();
    expect(document.activeElement).toBe(next());
    expect(back().disabled).toBe(true);
    for (const name of ['Move', 'Push', 'Out-number them', 'Controls']) {
      next().click();
      expect(title()).toBe(name);
    }
    expect(byId('guide-count').textContent).toBe('5 / 5');
    expect(byId('guide-text').querySelectorAll('[data-controls]')).toHaveLength(3);
    expect(next().textContent).toBe('Play');
    next().click();
    expect(guide().hidden).toBe(true);
    expect(localStorage.getItem('ab-alone.guide')).toBe('seen');
  });

  it('Back steps back and Skip closes it at any page for good', async () => {
    await boot('?bot=off', { webdriver: false });
    next().click();
    next().click();
    expect(back().disabled).toBe(false);
    back().click();
    expect(title()).toBe('Move');
    expect(next().textContent).toBe('Next');
    byId('guide-skip').click();
    expect(guide().hidden).toBe(true);
    expect(localStorage.getItem('ab-alone.guide')).toBe('seen');
  });

  it('Escape skips it; the keys pressed in it never reach the game, and Tab keeps the focus in it', async () => {
    await boot('?bot=off', { webdriver: false });
    const skip = byId('guide-skip');
    skip.focus();
    expect(key(skip, 'Tab', true)).toBe(false); // the first stop wraps to the last
    expect(document.activeElement).toBe(next());
    expect(key(next(), 'Tab')).toBe(false);
    expect(document.activeElement).toBe(skip);
    let reached = false;
    addEventListener('keydown', () => (reached = true), { once: true });
    expect(key(guide(), 'Escape')).toBe(false);
    expect(reached).toBe(false);
    expect(guide().hidden).toBe(true);
    key(document.body, 'Escape'); // closed, the guide takes no key
    expect(reached).toBe(true);
  });

  it('does not open in an automated browser, unless ?guide asks for it', async () => {
    await boot('?bot=off');
    expect(guide().hidden).toBe(true);
    await boot('?bot=off&guide');
    expect(guide().hidden).toBe(false);
  });

  it('opens again from the settings menu, which closes, and gives the focus back to the cog when it closes', async () => {
    const game = await boot('?bot=off');
    game.openSettings();
    byId('setting-guide').click();
    expect(byId('settings-menu').hidden).toBe(true);
    expect(guide().hidden).toBe(false);
    expect(title()).toBe('Push them into the void');
    byId('guide-skip').click();
    expect(document.activeElement).toBe(byId('settings'));
  });

  it('the pad walks it: the D-pad and LB RB move the focus inside it, A presses, B skips', async () => {
    const game = await boot('?bot=off&guide');
    const tap = plugPad(game);
    tap(15); // D-pad right: the next stop after Next wraps to Skip
    expect(document.activeElement).toBe(byId('guide-skip'));
    tap(4); // LB: Shift+Tab, back to Next
    expect(document.activeElement).toBe(next());
    tap(0); // A
    expect(title()).toBe('Move');
    tap(1); // B
    expect(guide().hidden).toBe(true);
    Reflect.deleteProperty(navigator, 'getGamepads');
  });
});

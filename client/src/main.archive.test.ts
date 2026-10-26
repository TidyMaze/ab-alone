// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot, type Game } from './test/harness';

// The log archive (#513): the Log archive item of the settings menu lists the lore entries already read, in place of
// the items, and a press on one reopens it in the terminal reader (#512). Leaving the reader gives the console its
// deck's entry back.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const menu = (): HTMLElement => byId('settings-menu');
const data = (): DOMStringMap => document.body.dataset;
const key = (k: string): void => void dispatchEvent(new KeyboardEvent('keydown', { key: k }));
const rows = (): HTMLButtonElement[] => [...menu().querySelectorAll<HTMLButtonElement>('.setting-archive button')];

/** A page whose console shows its first entry: the fonts are in. */
async function ready(): Promise<Game> {
  const game = await boot('?bot=off');
  await game.settle();
  game.frame();
  return game;
}

describe('main.ts, the log archive (#513)', () => {
  it('is a short word beside Import game in the settings menu, named Log archive as a tooltip', async () => {
    await ready();
    const row = byId('setting-log-archive');
    expect([row.textContent, row.title]).toEqual(['Logs', 'Log archive']);
    expect(row.hasAttribute('aria-pressed')).toBe(false); // an action, not a toggle
    expect(row.parentElement!.className).toBe('setting-group'); // no row of its own, as FPS beside Clear board
    expect(row.parentElement!.firstElementChild).toBe(byId('setting-import-game'));
  });

  it('says so when nothing was read yet, and the menu opens on its items again once closed', async () => {
    const game = await ready();
    game.openSettings();
    byId('setting-log-archive').click();
    expect(menu().dataset.page).toBe('archive');
    expect(rows()).toEqual([]);
    expect(menu().querySelector('.setting-archive')!.textContent).toBe('Nothing read yet.');
    game.openSettings(); // the cog closes it
    expect(menu().hidden).toBe(true);
    expect(menu().dataset.page).toBeUndefined();
  });

  it('lists the entries read in the ship order, and a press reopens one in the reader', async () => {
    const game = await ready();
    localStorage.setItem('ab-alone.lore-read', 'cargo-assay,mess-house-rule');
    game.openSettings();
    byId('setting-log-archive').click();
    expect(rows().map((b) => b.textContent)).toEqual(["Captain's order, pinned above table four", 'Assay note, ore bay two']);
    expect(document.activeElement).toBe(rows()[0]);
    rows()[1]!.click();
    expect(menu().hidden).toBe(true);
    expect(byId('settings').getAttribute('aria-expanded')).toBe('false');
    expect(byId('reader').hidden).toBe(false);
    expect(data().reading).toBe('cargo-assay');
    expect(data().console).toMatch(/^cargo-assay 1\/\d$/);
    expect(byId('reader').querySelector('p')!.textContent).toBe('Assay note, ore bay two');
    key('Escape');
    expect(byId('reader').hidden).toBe(true);
    game.frame();
    expect(data().console).toBe('mess-house-rule 1/2'); // the console shows its deck's entry again
    expect(localStorage.getItem('ab-alone.lore-read')).toBe('cargo-assay,mess-house-rule'); // read once each
  });

  it('opens nothing before the web fonts are in', async () => {
    const game = await boot('?bot=off', { fonts: () => new Promise(() => {}) });
    game.frame();
    localStorage.setItem('ab-alone.lore-read', 'cargo-assay');
    game.openSettings();
    byId('setting-log-archive').click();
    rows()[0]!.click();
    expect(byId('reader').hidden).toBe(true);
    expect(data().reading).toBeUndefined();
  });
});

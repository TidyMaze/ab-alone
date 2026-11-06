// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';

// The bot's estimated rating and level in the fight HUD (#1611, docs/specs/roguelite.md section 32): a plain bot game and a run fight.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const badge = (): HTMLElement | null => document.querySelector('#hud .bot-rating');
const medals = (n: number): void => localStorage.setItem('ab-alone.medals', JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [`boss${i}`, 9]))));

describe('main.ts, the bot rating, #1611', () => {
  it('a new player meets the lowest bot: about 1070, Easy, and says it is an estimate', async () => {
    localStorage.clear();
    await boot('/');
    expect(badge()!.textContent).toBe('Bot ~1070 · Easy');
    expect(badge()!.title).toMatch(/estimate/i);
    expect(document.body.dataset.botRating).toBe('1070');
  });

  it('the bot grows with the bosses beaten: all fifteen medals is the peak, 60000 positions, Hard', async () => {
    localStorage.clear();
    medals(15);
    await boot('/');
    expect(badge()!.textContent).toBe('Bot ~1600 · Hard');
    medals(40); // more than the roster counts for nothing more
    await boot('/');
    expect(badge()!.textContent).toBe('Bot ~1600 · Hard');
  });

  it('the difficulty setting multiplies the budget: Hard doubles it', async () => {
    localStorage.clear();
    localStorage.setItem('ab-alone.difficulty', 'hard');
    await boot('/');
    expect(badge()!.textContent).toBe('Bot ~1130 · Easy');
  });

  it('a test budget (?nodes) is not scaled by the medals', async () => {
    localStorage.clear();
    medals(15);
    await boot('?nodes=50');
    expect(badge()!.textContent).toBe('Bot ~940 · Easy');
  });

  it('the first fight of a run is at a quarter of the bot of the medals, and no badge on the map', async () => {
    localStorage.clear();
    const game = await boot('/', { indexedDB: new IDBFactory() });
    game.openModes();
    byId('roguelite').click();
    expect(badge()).toBeNull();
    [...byId('run-map').querySelectorAll<HTMLButtonElement>('button[data-node]')].find((b) => !b.disabled)!.click();
    expect(badge()!.textContent).toBe('Bot ~940 · Easy'); // 200 positions at 25 %: 50
  });

  it('a boss fight shows none for now: its own budget is fixed, and the badge is for the bot the game scales', async () => {
    localStorage.clear();
    const game = await boot('/');
    game.openModes();
    byId('boss-fight').click();
    byId('boss-list').querySelector('button')!.click();
    expect(badge()).toBeNull();
    expect(document.body.dataset.botRating).toBeUndefined();
  });
});

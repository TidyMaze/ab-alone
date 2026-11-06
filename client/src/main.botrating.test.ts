// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';

// The bot's estimated rating and level in the fight HUD (#1611, docs/specs/roguelite.md section 32): a plain bot game and a run fight.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const badge = (): HTMLElement | null => document.querySelector('#hud .bot-rating');
const medals = (n: number): Record<string, string> => ({ 'ab-alone.medals': JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [`boss${i}`, 9]))) });

describe('main.ts, the bot rating, #1611', () => {
  it('a new player meets the lowest bot: about 1070, Easy, and says it is an estimate', async () => {
    await boot('?real=1');
    expect(badge()!.textContent).toBe('Bot ~1070 · Easy');
    expect(badge()!.title).toMatch(/estimate/i);
    expect(document.body.dataset.botRating).toBe('1070');
  });

  it('the bot grows with the bosses beaten: all fifteen medals is the peak, 60000 positions, Hard', async () => {
    await boot('?real=1', { storage: medals(15) });
    expect(badge()!.textContent).toBe('Bot ~1600 · Hard');
    await boot('?real=1', { storage: medals(40) }); // more than the roster counts for nothing more
    expect(badge()!.textContent).toBe('Bot ~1600 · Hard');
  });

  it('the difficulty setting multiplies the budget: Hard doubles it', async () => {
    await boot('?real=1', { storage: { 'ab-alone.difficulty': 'hard' } });
    expect(badge()!.textContent).toBe('Bot ~1130 · Easy');
  });

  it('a test budget (?nodes) is not scaled by the medals', async () => {
    await boot('?nodes=50', { storage: medals(15) });
    expect(badge()!.textContent).toBe('Bot ~940 · Easy');
  });

  it('the first fight of a run is at a quarter of the bot of the medals, and no badge on the map', async () => {
    const game = await boot('?real=1', { indexedDB: new IDBFactory() });
    game.openModes();
    byId('roguelite').click();
    expect(badge()).toBeNull();
    [...byId('run-map').querySelectorAll<HTMLButtonElement>('button[data-node]')].find((b) => !b.disabled)!.click();
    expect(badge()!.textContent).toBe('Bot ~940 · Easy'); // 200 positions at 25 %: 50
  });

  it('a boss fight shows none for now: its own budget is fixed, and the badge is for the bot the game scales', async () => {
    const game = await boot('?real=1');
    game.openModes();
    byId('boss-fight').click();
    byId('boss-list').querySelector('button')!.click();
    expect(badge()).toBeNull();
    expect(document.body.dataset.botRating).toBeUndefined();
  });
});

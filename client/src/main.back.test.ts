// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// Browser Back and the Android Back gesture (#1564, docs/specs/ui.md section "Browser Back"): a screen other than the one the page
// started on holds one history entry, and Back runs the way out the screen already has: a mode goes to the Hub, the Hub to the table,
// Back to the hub / Back to the Open world where the screen shows them.

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const data = () => document.body.dataset;
const marked = (): boolean => (history.state as { ab?: number } | null)?.ab === 1;
const hubOn = (): boolean => data().hub !== undefined;
/** Presses Back and waits for the page's popstate. */
async function pressBack(game: Game): Promise<() => number> {
  const popped = new Promise((done) => window.addEventListener('popstate', done, { once: true }));
  history.back();
  const leave = vi.spyOn(history, 'back').mockImplementation(() => undefined); // the page's own call to go on back, which would leave the page: counted, not made
  await popped;
  await game.settle();
  game.frame(); // the frame that asks for the entry of the screen Back landed on
  return () => leave.mock.calls.length;
}
async function pick(game: Game, id: string): Promise<void> {
  game.openModes();
  byId(id).click();
  await game.settle();
  game.frame();
}
const bossPick = async (game: Game): Promise<void> => {
  game.openModes();
  byId('boss-fight').click();
  byId('boss-list').querySelector('button')!.click();
  await game.settle();
  game.frame();
};
const MODES: [string, (game: Game) => Promise<void>, () => boolean][] = [
  ['Battle royale', (g) => pick(g, 'battle-royale'), () => !byId('royale-hold').hidden],
  ['Rogue-lite run', (g) => pick(g, 'roguelite'), () => !byId('run-map').hidden],
  ['Daily challenge', (g) => pick(g, 'daily'), () => data().boss !== undefined],
  ['Trainer', (g) => pick(g, 'trainer'), () => data().trainer !== undefined],
  ['Boss fight', bossPick, () => data().boss !== undefined],
  ['Open world', (g) => pick(g, 'openworld'), () => data().openworld !== undefined],
];

vi.setConfig({ testTimeout: 8000 });

describe('main.ts, browser Back (#1564)', () => {
  it.each(MODES)('%s holds one history entry and Back goes to the Hub', async (_name, enter, on) => {
    const game = await boot('?bot=off&openworld=7');
    expect(marked()).toBe(false);
    await enter(game);
    expect(on()).toBe(true);
    expect(marked()).toBe(true);
    await pressBack(game);
    expect(on()).toBe(false);
    expect(hubOn()).toBe(true);
    expect(game.hud()).toContain('Hub');
  });

  it('Back from the Hub goes to the table, and a Back on the table leaves the page', async () => {
    const game = await boot('?bot=off');
    await pick(game, 'ship');
    expect(hubOn()).toBe(true);
    expect(marked()).toBe(true);
    const left = await pressBack(game);
    expect(hubOn()).toBe(false);
    expect(game.hud()).toContain('Black to move');
    expect(marked()).toBe(false);
    expect(left()).toBe(0); // the table is the base screen: the page stays
  });

  it('a mode left by its own button to the Hub keeps its entry, and Back then goes to the table', async () => {
    const game = await boot('?bot=off');
    await bossPick(game);
    await pick(game, 'ship');
    expect(marked()).toBe(true);
    await pressBack(game);
    expect(hubOn()).toBe(false);
    expect(game.hud()).toContain('Black to move');
  });

  it('a mode left by New game leaves a stale entry: the Back on the table is the browser\'s own and leaves at once', async () => {
    const game = await boot('?bot=off');
    await pick(game, 'ship');
    byId('new-game').click();
    expect(hubOn()).toBe(false);
    const left = await pressBack(game);
    expect(hubOn()).toBe(false);
    expect(left()).toBe(1); // one press, not two
  });

  it('the page started on the Hub: Back from a mode lands on it, and the next Back leaves the page', async () => {
    const game = await boot('/');
    expect(hubOn()).toBe(true);
    await bossPick(game);
    expect(marked()).toBe(true);
    const left = await pressBack(game);
    expect(hubOn()).toBe(true);
    expect(marked()).toBe(false);
    expect(left()).toBe(0);
  });

  it('Back to the hub is the way out of a table opened from the Hub, mid-fight or not', async () => {
    const game = await boot('?bot=off');
    localStorage.setItem('ab-alone.progress', JSON.stringify({ version: 1, deck: 'mess', cell: [1, 0], beaten: [] }));
    await pick(game, 'ship');
    game.click(2, 0); // the boss door of the Mess: the fight is on, Back to the hub is hidden
    game.frame();
    expect(data().boss).toBe('echo');
    expect(byId('ship-back').hidden).toBe(true);
    await pressBack(game);
    expect(hubOn()).toBe(true);
    expect(data().hub).toBe('mess 2,0'); // the marble on the door's cell, as Back to the hub puts it
  });

  it('Back from a town of the Open world goes back to the world', async () => {
    const game = await boot('?bot=off&openworld=7');
    await pick(game, 'openworld');
    const [q, r] = data().openworldPlaces!.split(' ').find((p) => p.startsWith('town:'))!.slice(5).split(',').map(Number) as unknown as Axial;
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    game.frame();
    expect(hubOn()).toBe(true);
    expect(byId('place-back').hidden).toBe(false);
    await pressBack(game);
    expect(hubOn()).toBe(false);
    expect(data().openworld).toBeDefined();
  });

  it('Back from the fight of a boss lair goes back to the world, played or not', async () => {
    const game = await boot('?bot=off&openworld=7');
    await pick(game, 'openworld');
    const [q, r] = data().openworldLairs!.split(' ')[0]!.split(',').map(Number) as unknown as Axial;
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    game.frame();
    expect(data().boss).toBeDefined();
    await pressBack(game);
    await game.settle();
    expect(data().boss).toBeUndefined();
    expect(data().openworld).toBeDefined();
  });

  it('an online room keeps what the browser does: Back drops the address and the room stays', async () => {
    const game = await boot('?bot=off&net=hook');
    game.openModes();
    byId('play-online').click();
    await game.online();
    game.frame();
    expect(location.hash).not.toBe('');
    await pressBack(game);
    expect(location.hash).toBe('');
    expect(data().online).toBeDefined();
    expect(hubOn()).toBe(false);
  });
});

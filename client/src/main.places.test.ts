// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// The towns and dungeon gates of the Open world (#1593, docs/specs/openworld.md section 13): rolling onto a town opens the Hub, rolling onto a
// gate starts the rogue-lite run, and "Back to the Open world" returns the hero to the entrance cell, as a lair does (#1170).

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const data = () => document.body.dataset;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
};
const hooks = () => window as unknown as { __openworldFixture: (f: { hero: Axial; troop: Axial[]; enemies: Axial[] }) => void };

/** Opens the world of seed 7, stands the hero west of the first place of `kind` and rolls onto it. Returns the entrance cell. */
async function rollOnto(game: Game, kind: 'town' | 'dungeon', open = true): Promise<Axial> {
  if (open) {
    game.openModes();
    byId('openworld').click();
    await settle();
  }
  const [q, r] = data()
    .openworldPlaces!.split(' ')
    .find((p) => p.startsWith(`${kind}:`))!
    .slice(kind.length + 1)
    .split(',')
    .map(Number) as unknown as Axial;
  hooks().__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  return [q - 1, r];
}

describe('a town of the Open world (#1593)', () => {
  it('rolling onto a town leaves the world and opens the Hub, with a button back to the world', async () => {
    const game = await boot('?bot=off&openworld=7');
    expect(byId('place-back').hidden).toBe(true);
    await rollOnto(game, 'town');
    expect(data().openworld).toBeUndefined();
    expect(data().hub).toBeTruthy();
    expect(byId('place-back').hidden).toBe(false);
    expect(byId('place-back').textContent).toBe('Back to the Open world');
  });

  it('the button puts the hero back on the entrance cell, and is gone', async () => {
    const game = await boot('?bot=off&openworld=7');
    const entrance = await rollOnto(game, 'town');
    await settle();
    byId('place-back').click();
    await settle();
    expect(data().hub).toBeUndefined();
    expect(data().openworldAt).toBe(entrance.join(','));
    expect(byId('place-back').hidden).toBe(true);
  });

  it('a table entered from the Hub of a town and left by the Hub of the menu keeps the way back to the world', async () => {
    const game = await boot('?bot=off&openworld=7');
    localStorage.setItem('ab-alone.progress', JSON.stringify({ version: 1, deck: 'mess', cell: [-1, 0], beaten: [] }));
    const entrance = await rollOnto(game, 'town');
    expect(data().hub).toBe('mess -1,0');
    game.click(-1, -1); // the hot-seat table
    expect(data().hub).toBeUndefined();
    expect(byId('place-back').hidden).toBe(true); // a game, not the Hub
    game.openModes();
    byId('ship').click();
    expect(byId('place-back').hidden).toBe(false);
    byId('place-back').click();
    await settle();
    expect(data().openworldAt).toBe(entrance.join(','));
  });

  it('the Hub reached from the menu has no way back to a world', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    byId('ship').click();
    expect(data().hub).toBeTruthy();
    expect(byId('place-back').hidden).toBe(true);
  });

  it('another mode picked in the Hub of a town ends the way back: it is no town\'s', async () => {
    const game = await boot('?bot=off&openworld=7');
    await rollOnto(game, 'town');
    game.openModes();
    byId('trainer').click();
    expect(byId('place-back').hidden).toBe(true);
    game.openModes();
    byId('ship').click();
    expect(data().hub).toBeTruthy();
    expect(byId('place-back').hidden).toBe(true);
  });

  it('the Open world of the menu, from the Hub of a town, is the world as it was left, and the button is gone', async () => {
    const game = await boot('?bot=off&openworld=7');
    const entrance = await rollOnto(game, 'town');
    await settle();
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(data().openworldAt).toBe(entrance.join(','));
    expect(byId('place-back').hidden).toBe(true);
  });
});

describe('a dungeon gate of the Open world (#1593)', () => {
  it('rolling onto a gate leaves the world and opens the rogue-lite run at its start screen, with a button back to the world', async () => {
    const game = await boot('?bot=off&openworld=7');
    await rollOnto(game, 'dungeon');
    expect(data().openworld).toBeUndefined();
    expect(data().run).toBe('map');
    expect(byId('run-map').hidden).toBe(false);
    expect(byId('place-back').hidden).toBe(false);
  });

  it('the button leaves the run for the world, the hero on the entrance cell', async () => {
    const game = await boot('?bot=off&openworld=7');
    const entrance = await rollOnto(game, 'dungeon');
    await settle();
    byId('place-back').click();
    await settle();
    expect(data().run).toBeUndefined();
    expect(data().openworldAt).toBe(entrance.join(','));
    expect(byId('place-back').hidden).toBe(true);
  });

  it('a run started from the menu has no way back to a world', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('roguelite').click();
    expect(data().run).toBe('map');
    expect(byId('place-back').hidden).toBe(true);
  });
});

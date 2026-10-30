// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Axial, Move } from './board';
import { newRun, pick } from './roguelite';
import { boot, type Game } from './test/harness';

// The rogue-lite run on the harness (#798, docs/specs/roguelite.md): Rogue-lite run in the mode menu shows the map of
// a new run, a pick starts the fight of that node against the bot with the army's marbles, a reload resumes it, the
// run ends on a loss, and another mode abandons it.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const map = (): HTMLElement => byId('run-map');
const line = (): string => map().querySelector('.run-line')!.textContent!;
const open = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-node]')].filter((b) => !b.disabled);
async function startRun(url: string, indexedDB = new IDBFactory()): Promise<Game> {
  const game = await boot(url, { indexedDB });
  game.openModes();
  byId('roguelite').click();
  return game;
}
/** Plays the first legal single-marble move of the side to move by two clicks, as a player does. */
function playMove(game: Game): void {
  const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
  game.click(...move.cells[0]!);
  game.click(...game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
}
/** Selects `cells` and clicks `target`. */
function play(game: Game, cells: Axial[], target: Axial): void {
  for (const cell of cells) game.click(...cell);
  game.click(...target);
  game.frame(1000); // the slide ends
}

describe('main.ts, the rogue-lite run (#798)', () => {
  it('Rogue-lite run in the mode menu shows the map of a new run, act 1 to pick', async () => {
    await startRun('?bot=off');
    expect(byId('mode-menu').hidden).toBe(true);
    expect(map().hidden).toBe(false);
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(open().length).toBeGreaterThanOrEqual(2);
    expect(open().every((b) => b.getAttribute('aria-label') === 'Act 1, fight')).toBe(true);
    for (const id of ['new-game', 'boss-retry', 'hint', 'eval', 'setting-export-game', 'setting-import-game'])
      expect(byId(id).hidden, id).toBe(true);
    map().querySelector<HTMLElement>('.run-line')!.click(); // no node there: nothing happens
    expect(document.body.dataset.run).toBe('map');
  });

  it('a pick starts its fight against the bot, and a reload resumes the fight with its moves', async () => {
    const indexedDB = new IDBFactory();
    const game = await startRun('?nodes=50', indexedDB);
    open()[0]!.click();
    expect(map().hidden).toBe(true);
    expect(document.body.dataset.run).toBe('fight');
    expect(game.hud()).toContain('Rogue-lite run · act 1 fight · army 14 marbles');
    playMove(game);
    await game.settle(); // the bot's reply, and the save
    game.frame(1000); // the bot's move waits for the slide of the player's
    await game.settle();
    expect(game.hook('__plies')).toBe(2);
    const again = await boot('?nodes=50', { indexedDB });
    expect(document.body.dataset.run).toBe('fight');
    expect(again.hook('__plies')).toBe(2);
    expect(again.hud()).toContain('Rogue-lite run · act 1 fight');
  });

  it('Auto-play is greyed in a run fight, its reason given', async () => {
    await startRun('?nodes=50');
    open()[0]!.click();
    expect(byId<HTMLButtonElement>('auto-play').hidden).toBe(false);
    expect(byId<HTMLButtonElement>('auto-play').disabled).toBe(true);
    expect(byId('auto-reason').textContent).toBe('Not in a rogue-lite run');
  });

  it('a marble lost by an army of 4 loses the run, and New run starts another', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', pick({ ...newRun(1), army: 4 }, 0)); // the army keeps (1, 3), (-2, 2), (-1, 2), (0, 2)
    expect(document.body.dataset.run).toBe('fight');
    // White walks its column q = 1 down four times while Black steps (-2, 2) aside and back, then pushes (1, 3) off.
    const column = (k: number): Axial[] => [-4, -3, -2].map((r): Axial => [1, r + k]);
    for (let k = 0; k < 5; k++) {
      play(game, k % 2 ? [[-3, 2]] : [[-2, 2]], k % 2 ? [-2, 2] : [-3, 2]);
      play(game, column(k), [1, -1 + k]);
    }
    await game.settle();
    expect(document.body.dataset.run).toBe('lost');
    expect(map().hidden).toBe(false);
    expect(line()).toBe('Run lost · 3 marbles left');
    byId('run-new').click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · army 14 marbles · pick a fight');
  });

  it('an invite link wins over a saved run: the online game starts, the run stays saved for later', async () => {
    const indexedDB = new IDBFactory();
    const first = await boot('?bot=off', { indexedDB });
    await first.hook('__run', pick(newRun(1), 0));
    await first.settle();
    const game = await boot('?net=hook#room=the-room', { indexedDB });
    for (let i = 0; i < 50 && document.body.dataset.seat !== 'pending'; i++) await game.settle();
    expect(document.body.dataset.online).toBe('White');
    expect(document.body.dataset.run).toBeUndefined();
    expect(map().hidden).toBe(true);
    expect(game.hud()).not.toContain('Rogue-lite run');
    await game.settle();
    expect(game.hook('__plies')).toBe(0); // no bot on the run's side of the board
    await boot('?bot=off', { indexedDB });
    expect(document.body.dataset.run).toBe('fight');
  });

  it('a run keeps the saved local game: it is back once the run is left', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    playMove(game);
    await game.settle(); // the local game is saved
    game.openModes();
    byId('roguelite').click();
    await game.settle();
    game.openModes();
    byId('daily').click(); // the run is abandoned
    await game.settle();
    const again = await boot('?bot=off', { indexedDB });
    expect(again.hook('__plies')).toBe(1);
  });

  it('another mode abandons the run: it is gone after a reload', async () => {
    const indexedDB = new IDBFactory();
    const game = await startRun('?bot=off', indexedDB);
    game.openModes();
    byId('daily').click();
    expect(map().hidden).toBe(true);
    expect(document.body.dataset.run).toBeUndefined();
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(document.body.dataset.run).toBeUndefined();
  });

  // The special marbles (#961): placed before the first move, a reward after a won fight, a Spark's burst.
  const specials = (): string => document.body.dataset.specials!;
  it('places the army special marbles before the first move, saves them, and the first move starts the fight', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', pick({ ...newRun(1), specials: [1, 0, 2] }, 0));
    expect(document.body.dataset.run).toBe('place');
    expect(map().hidden).toBe(false);
    expect(map().classList.contains('place')).toBe(true);
    expect(line()).toBe('Place your special marbles');
    const kinds = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-kind]')];
    expect(kinds().map((b) => b.textContent)).toEqual(['Heavy · 1 left', 'Spark · 2 left']);
    game.click(0, 4); // no type picked: a plain selection
    expect(specials()).toBe('');
    game.click(0, 4); // the selection taken back
    kinds()[0]!.click();
    expect(kinds()[0]!.getAttribute('aria-pressed')).toBe('true');
    game.click(0, -4); // a bot marble: nothing
    game.click(0, 0); // an empty cell: nothing
    game.click(0, 4);
    expect(specials()).toBe('0,4,1');
    expect(kinds()[0]!.textContent).toBe('Heavy · 0 left');
    kinds()[1]!.click();
    game.click(1, 3);
    expect(specials()).toBe('0,4,1 1,3,3');
    kinds()[1]!.click(); // pressed again: no type picked
    expect(kinds().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    await game.settle();
    const again = await boot('?bot=off', { indexedDB }); // a reload keeps the placements
    expect(document.body.dataset.run).toBe('place');
    expect(specials()).toBe('0,4,1 1,3,3');
    play(again, [[-2, 2]], [-3, 2]);
    expect(document.body.dataset.run).toBe('fight');
    expect(map().hidden).toBe(true);
    expect(specials()).toBe('0,4,1 1,3,3');
  });

  it('a won fight offers a reward, its pick goes back to the map', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...newRun(1), army: 12, path: [0], reward: true });
    expect(document.body.dataset.run).toBe('reward');
    expect(line()).toBe('Fight won · pick a reward');
    const offers = [...map().querySelectorAll<HTMLButtonElement>('button[data-offer]')];
    expect(offers).toHaveLength(3);
    const offer = Number(offers[0]!.dataset.offer);
    offers[0]!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toContain(offer ? 'army 12 marbles, 1 ' : 'army 13 marbles');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(document.body.dataset.run).toBe('map'); // the reward is saved with the run
  });

  it.each([false, true])('a Spark pushed off bursts on screen, never with reduced motion (%s)', async (reducedMotion) => {
    const game = await boot('?bot=off', { reducedMotion });
    await game.hook('__run', { ...pick({ ...newRun(1), army: 4, specials: [1, 0, 1] }, 0), placed: [[1, 3, 3], [0, 2, 1]] });
    const column = (k: number): Axial[] => [-4, -3, -2].map((r): Axial => [1, r + k]);
    for (let k = 0; k < 5; k++) {
      play(game, k % 2 ? [[-3, 2]] : [[-2, 2]], k % 2 ? [-2, 2] : [-3, 2]);
      play(game, column(k), [1, -1 + k]);
    }
    expect(document.body.dataset.sparks).toBe(reducedMotion ? undefined : '1');
    await game.settle();
    expect(document.body.dataset.run).toBe('lost');
    expect(specials()).toBe('0,2,1'); // the Heavy stayed, the Spark went off
  });
});

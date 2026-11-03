// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { cellIndex, type Axial, type Move } from './board';
import { actBoss, BIOMES, ELITES, FORMATIONS, newRun, parseMap, pick, Relic, RELICS, relicText, visit, type MapNode, type Run } from './roguelite';
import { AUTO_DELAY_MS } from './autoplay';
import { LEGACY_UNLOCKED } from './collector';
import type { View } from './camera';
import { boot, type Game } from './test/harness';

// The rogue-lite run on the harness (#798, docs/specs/roguelite.md): Rogue-lite run in the mode menu shows the map of
// a new run, a pick starts the fight of that node against the bot with the army's marbles, a reload resumes it, the
// run ends on a loss, and another mode abandons it.

/** A run that fights the plain army of before the varied enemies (#1462), so the scripted fights below stay scripted. */
const plainRun = (seed: number, best: number): Run => ({ ...newRun(seed, best, LEGACY_UNLOCKED), enemies: false });
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
  game.frame(1000); // then the Echo's bonus slide (#958)
}

/** The path of the run `seed` from the act 1 first row, by first links, to the act 1 boss. */
function toBoss(nodes: MapNode[]): number[] {
  const path = [0];
  for (let n = nodes[0]!; n.kind !== 'boss'; ) {
    const i = nodes.findIndex((m) => m.act === n.act && m.row === n.row + 1 && m.col === n.links[0]);
    path.push(i);
    n = nodes[i]!;
  }
  return path;
}
async function bossRun(id: string): Promise<{ state: Run; nodes: MapNode[] }> {
  const { boss_ids, run_map } = await import('abalone-wasm');
  for (let seed = 0; ; seed++) {
    const nodes = parseMap(run_map(seed));
    const path = toBoss(nodes);
    const state = pick({ ...plainRun(seed, 3), path: path.slice(0, -1) }, path[path.length - 1]!);
    if (actBoss(nodes, state, boss_ids())?.id === id) return { state, nodes };
  }
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
    expect(game.hud()).toContain('Rogue-lite run · act 1 fight'); // its formation too, from a random seed
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

  it('Auto-play plays the player side of a run fight, the bot answers, and a tactic held stays unplayed (#1489)', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', pick({ ...plainRun(3, 3), tactics: [2, 3, 4] }, 0));
    expect(byId<HTMLButtonElement>('auto-play').hidden).toBe(false);
    expect(byId<HTMLButtonElement>('auto-play').disabled).toBe(false);
    expect(byId('auto-reason').hidden).toBe(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    byId('auto-play').click();
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS);
      game.frame(1000);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(game.hook<number>('__plies')).toBeGreaterThanOrEqual(3);
    expect(document.body.dataset.tactics).toBe('2,3,4'); // a tactic is the player's to play
    byId('auto-play').click();
    vi.useRealTimers();
  });

  it('Auto-play is greyed against an act boss without its medal, and plays with it (#1489)', async () => {
    const game = await boot('?nodes=50');
    const { state } = await bossRun('hull');
    await game.hook('__run', state);
    expect(byId<HTMLButtonElement>('auto-play').disabled).toBe(true);
    expect(byId('auto-reason').textContent).toBe('Beat The Hull once to unlock Auto-play against it');
    localStorage.setItem('ab-alone.medals', JSON.stringify({ hull: 7 }));
    await game.hook('__run', state);
    expect(byId<HTMLButtonElement>('auto-play').disabled).toBe(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    byId('auto-play').click();
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS);
    game.frame(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(game.hook<number>('__plies')).toBeGreaterThanOrEqual(1);
    byId('auto-play').click();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('a marble lost by an army of 4 loses the run, and New run starts another', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', pick({ ...plainRun(3, 3), army: 4, path: [0] }, 2)); // an elite (14 White, the plain army of a run saved before #1462): the army keeps (1, 3), (-2, 2), (-1, 2), (0, 2)
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
    expect(map().querySelector('.run-tally')!.textContent).toBe('Run voided. Audit reopened.');
    byId('run-new').click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · army 14 marbles · pick a fight');
  });

  it('an invite link wins over a saved run: the online game starts, the run stays saved for later', async () => {
    const indexedDB = new IDBFactory();
    const first = await boot('?bot=off', { indexedDB });
    await first.hook('__run', pick(plainRun(1, 3), 0));
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
    await game.hook('__run', pick({ ...plainRun(1, 3), specials: [1, 0, 2] }, 0));
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
    expect(kinds()[0]!.getAttribute('aria-pressed')).toBe('false'); // none left: the type is put down
    game.click(1, 3); // a plain selection again
    game.click(1, 3);
    expect(specials()).toBe('0,4,1');
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

  it('fields a Magnet, a Shield, a Bomb and a Medic: placed, drawn, saved, and the Bomb bursts on the third army turn (#1461)', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    const counts = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    await game.hook('__run', { ...pick({ ...plainRun(3, 3), specials: counts }, 0), placed: [[-4, 4, 7], [-3, 4, 8], [0, 4, 9], [-1, 4, 10]] });
    expect(map().classList.contains('place')).toBe(true);
    expect([...map().querySelectorAll('button[data-kind]')].map((b) => b.textContent)).toEqual(['Magnet · 0 left', 'Shield · 0 left', 'Bomb · 0 left', 'Medic · 0 left']);
    expect(specials()).toBe('-4,4,7 -3,4,8 -1,4,10 0,4,9');
    // The Bomb shows its fuse, 3 turns of its side at the start, on the marble and in the HUD (#1490).
    expect(document.body.dataset.fuses).toBe('0,4,3');
    expect(document.getElementById('hud')!.textContent).toContain('Bomb: 3 turns left');
    play(game, [[-2, 2]], [-3, 2]);
    expect(document.body.dataset.fuses).toBe('0,4,2');
    expect(document.getElementById('hud')!.textContent).toContain('Bomb: 2 turns left');
    playMove(game);
    play(game, [[-3, 2]], [-2, 2]);
    playMove(game);
    expect(specials()).toBe('-4,4,7 -3,4,8 -1,4,10 0,4,9');
    expect(document.body.dataset.fuses).toBe('0,4,1');
    expect(document.getElementById('hud')!.textContent).toContain('Bomb: 1 turn left');
    await game.settle();
    const again = await boot('?bot=off', { indexedDB }); // a reload replays the two turns: the fuse has one left
    expect(specials()).toBe('-4,4,7 -3,4,8 -1,4,10 0,4,9');
    play(again, [[-2, 2]], [-3, 2]); // the army's third turn: the Bomb bursts where it stands and is gone
    expect(specials()).toBe('-4,4,7 -3,4,8 -1,4,10');
    expect(document.body.dataset.fuses).toBe(''); // the Bomb is gone with its fuse
    expect(document.getElementById('hud')!.textContent).not.toContain('Bomb:');
  });

  it('a won fight offers a reward, its pick goes back to the map', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(1, 3), army: 12, path: [0], reward: true });
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
    await game.hook('__run', { ...pick({ ...plainRun(3, 3), army: 4, specials: [1, 0, 1], path: [0] }, 2), placed: [[1, 3, 3], [0, 2, 1]] });
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

  // The cues of Magnet, Shield, Bomb and Medic (#1490): the ring of a burst, the slide of a pull, the drop of a Medic that
  // comes back, the flash of a Shield. They only show what the engine did.
  const counts = (kind: number): number[] => Array.from({ length: 10 }, (_, k) => Number(k === kind - 1));
  /** The fight of node 0 with `placed` marbles of `kind` and `moves` already played (records of the bridge). */
  const staged = (kind: number, placed: number[][], moves: number[][] = []): Run => ({ ...pick({ ...plainRun(3, 3), specials: counts(kind) }, 0), placed, moves });
  /** The record of a move of one marble on `(q, r)` in direction `dir`. */
  const ONE = (q: number, r: number, dir: number): number[] => [1, dir, q, r, 0, 0, 0, 0];

  it.each([false, true])('a Bomb bursts on its last turn with a ring in its colour, never with reduced motion (%s)', async (reducedMotion) => {
    const game = await boot('?bot=off', { reducedMotion });
    await game.hook('__run', staged(9, [[0, 4, 9]]));
    play(game, [[-2, 2]], [-3, 2]);
    playMove(game);
    play(game, [[-3, 2]], [-2, 2]);
    playMove(game);
    expect(document.body.dataset.bombs).toBeUndefined(); // the fuse has one turn left
    play(game, [[-2, 2]], [-3, 2]);
    expect(document.body.dataset.bombs).toBe(reducedMotion ? undefined : '1');
    expect(specials()).toBe('');
  });

  it.each([false, true])('a Magnet that moved slides the enemy marble it pulls to its new cell, at once with reduced motion (%s)', async (reducedMotion) => {
    const game = await boot('?bot=off', { reducedMotion });
    // Four plies, then the Magnet steps from (1, 1) to (1, 0): the white marble on (1, -2) comes to (1, -1).
    const moves = [ONE(-4, 3, 2), ONE(0, -4, 3), ONE(0, 2, 2), ONE(1, -3, 5)];
    await game.hook('__run', staged(7, [[0, 2, 7]], moves));
    const at = (q: number, r: number): number => game.hook<number[]>('__board')[cellIndex(q, r)]!;
    expect([at(1, -2), at(1, -1)]).toEqual([2, 0]);
    play(game, [[1, 1]], [1, 0]);
    expect([at(1, -2), at(1, -1), at(1, 0)]).toEqual([0, 2, 1]);
    expect(document.body.dataset.pulls).toBe(reducedMotion ? undefined : '1');
  });

  it.each([false, true])('a push into a Shield flashes it, even with reduced motion (%s)', async (reducedMotion) => {
    const game = await boot('?bot=off', { reducedMotion });
    // Six plies and a white Shield on (0, -3) that went down to (0, -1); Black pushes it with two marbles, nothing moves.
    const moves = [[2, 2, -2, 2, -1, 2, 0, 0], [2, 5, 0, -3, 1, -3, 0, 0], [2, 4, -3, 3, -2, 3, 0, 0], ONE(0, -2, 5), [3, 4, 0, 1, 0, 2, 0, 3], ONE(2, -3, 1)];
    await game.hook('__run', staged(8, [[0, -3, 8]], moves));
    expect(document.body.dataset.shields).toBeUndefined();
    play(game, [[0, 0], [0, 1]], [0, -1]);
    expect(document.body.dataset.shields).toBe('1');
    expect(specials()).toBe(''); // the Shield is spent
  });

  it.each([false, true])('a Medic thrown off drops back onto its row, never with reduced motion (%s)', async (reducedMotion) => {
    const game = await boot('?bot=off', { reducedMotion });
    // Eighteen plies in which the white Medic on (0, -3) was pushed to the rim; Black's push throws it off.
    const moves = [[3, 4, -2, 2, -2, 3, -2, 4], [2, 3, 0, -4, 0, -3, 0, 0], [2, 2, -2, 1, -2, 2, 0, 0], [2, 5, 2, -3, 3, -3, 0, 0], [1, 2, 1, 3, 0, 0, 0, 0], [1, 0, -1, -3, 0, 0, 0, 0], [1, 0, -3, 4, 0, 0, 0, 0], [2, 3, 3, -2, 4, -3, 0, 0], [1, 2, 0, 3, 0, 0, 0, 0], [1, 5, 2, -1, 0, 0, 0, 0], [2, 1, -1, 2, 0, 2, 0, 0], [2, 3, -1, -2, 0, -3, 0, 0], [2, 1, -1, 0, -1, 1, 0, 0], [1, 1, -2, -1, 0, 0, 0, 0], [3, 0, -3, 3, -2, 3, -1, 3], [2, 1, 1, -4, 1, -3, 0, 0], [2, 1, -2, 0, -2, 1, 0, 0], [3, 3, 2, -4, 3, -4, 4, -4]];
    await game.hook('__run', staged(10, [[0, -3, 10]], moves));
    expect(document.body.dataset.medics).toBeUndefined();
    play(game, [[-3, 0], [-3, 1]], [-3, -1]);
    expect(document.body.dataset.medics).toBe(reducedMotion ? undefined : '1');
    expect(specials()).toBe('');
  });

  it('the bot replays the fight with its special marbles: a Heavy push the plain board refuses, #961', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...pick({ ...plainRun(3, 3), specials: [1, 0, 0], path: [0] }, 2), placed: [[0, 4, 1]] });
    // The column q = 0 marches up while White steps (2, -2) down out of the way.
    for (let k = 0; k < 3; k++) {
      play(game, [0, 1, 2].map((d): Axial => [0, 2 + d - k]), [0, 1 - k]);
      play(game, [[2, -2 + k]], [2, -1 + k]);
    }
    await game.settle();
    const bot = await boot('?nodes=50', { indexedDB }); // the bot on, the run resumed
    expect(bot.hook('__plies')).toBe(6);
    play(bot, [[0, -1], [0, 0], [0, 1]], [0, -2]); // Heavy + 2 (4) push 3: legal with the Heavy only
    expect(bot.hook('__plies')).toBe(7);
    await bot.settle();
    bot.frame(1000);
    await bot.settle();
    expect(bot.hook('__plies')).toBe(8); // the bot answered on the same board
  });
  // Elites, rests, events and act bosses (#800). Seed 3: node 0 leads to the elite 2, the fight 1 to the rest 3, the
  // treasure 4 (#1457) and the event 5.
  const node = (i: number): HTMLButtonElement => map().querySelector<HTMLButtonElement>(`button[data-node="${i}"]`)!;
  it('a rest site from the map waits for its choice, saved with the run; Rest brings the army back to 14 with no fight', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(3, 3), army: 9, path: [1] });
    expect(node(3).getAttribute('aria-label')).toBe('Act 1, rest');
    expect(node(2).className).toBe('node elite marked');
    node(3).click();
    expect(document.body.dataset.run).toBe('rest');
    expect(line()).toBe('Rest site · rest or upgrade');
    expect(map().querySelector<HTMLButtonElement>('button[data-upgrade]')!.disabled).toBe(true); // no special marble
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the choice waiting (#1458)
    expect(document.body.dataset.run).toBe('rest');
    map().querySelector<HTMLButtonElement>('button[data-rest]')!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
  });

  it('Upgrade at a rest site makes a special marble upgraded, placed with its own type and a + on its glyph, #1458', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(3, 3), army: 9, specials: [1, 0, 0], path: [1] });
    node(3).click();
    map().querySelector<HTMLButtonElement>('button[data-upgrade="1"]')!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · rested · army 9 marbles, 1 Heavy+ · pick a fight');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · rested · army 9 marbles, 1 Heavy+ · pick a fight');
    node(6).click(); // the elite after the rest
    expect(document.body.dataset.run).toBe('place');
    const kind = map().querySelector<HTMLButtonElement>('button[data-kind]')!;
    expect(kind.textContent).toBe('Heavy+ · 1 left');
    kind.click();
    game.click(0, 3); // the back row is gone: an army of 9
    expect(specials()).toBe('0,3,4');
  });

  it.each([[false, 'taken'], [true, 'left']])('an unknown node turns into an event that waits for its choice, leave %s: %s, then the map goes on, #1463', async (leave) => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(3, 3), army: 12, specials: [0, 0, 1], path: [1] });
    expect(node(5).getAttribute('aria-label')).toBe('Act 1, unknown');
    node(5).click();
    expect(document.body.dataset.run).toBe('event');
    expect(line()).toMatch(/^Event · /);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the event waiting
    expect(document.body.dataset.run).toBe('event');
    const buttons = [...map().querySelectorAll<HTMLButtonElement>('button[data-choice]')];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons[buttons.length - 1]!.textContent).toBe('Leave');
    (leave ? buttons[buttons.length - 1]! : buttons[0]!).click();
    expect(document.body.dataset.run).toBe('map');
    const before = 'Rogue-lite run · army 12 marbles, 1 Spark · pick a fight';
    if (leave) expect(line()).toBe(before);
    else {
      expect(line()).not.toBe(before);
      expect(map().querySelector('.run-help')!.textContent).toMatch(/^[\w -]+: /); // what the event told
    }
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(map().querySelector('.run-help') !== null).toBe(!leave); // saved with the run
  });

  // The scrap and the shop (#1459). Seed 7: the fight 0 leads to the elite 2, which leads to the shop 4.
  it('a shop from the map sells for scrap, saved with the run; a purchase and a removal stay across a reload, Leave goes on, #1459', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(7, 3), army: 9, specials: [1, 0, 0], scrap: 200, path: [0, 2] });
    expect(line()).toBe('Rogue-lite run · army 9 marbles, 1 Heavy · 200 scrap · pick a fight');
    expect(node(4).getAttribute('aria-label')).toBe('Act 1, shop');
    node(4).click();
    expect(document.body.dataset.run).toBe('shop');
    expect(line()).toBe('Shop · 200 scrap');
    const press = (selector: string): void => map().querySelector<HTMLButtonElement>(selector)!.click();
    press('button[data-buy="0"]'); // a marble
    expect(document.body.dataset.run).toBe('shop');
    expect(map().querySelector('button[data-buy="0"]')).toBeNull(); // sold
    press('button[data-remove="1"]'); // the Heavy goes back to a plain marble
    expect(map().querySelector('button[data-remove="1"]')).toBeNull();
    const scrap = Number(line().match(/\d+/)![0]);
    expect(scrap).toBeLessThan(200 - 15 - 20);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the shop as it was
    expect(document.body.dataset.run).toBe('shop');
    expect(line()).toBe(`Shop · ${scrap} scrap`);
    expect(map().querySelector('button[data-buy="0"]')).toBeNull();
    press('button[data-leave]');
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe(`Rogue-lite run · army 10 marbles · ${scrap} scrap · pick a fight`);
  });

  // Flasks (#1475): a button on the map, saved with the run.
  it('a flask drunk on the map gives 3 marbles back and stays spent across a reload, #1475', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(7, 3), army: 8, path: [0] });
    const flask = (): HTMLButtonElement => map().querySelector<HTMLButtonElement>('button[data-flask]')!;
    expect(flask().textContent).toBe('Drink a flask: 3 marbles back · 2 left');
    flask().click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · army 11 marbles · pick a fight');
    expect(flask().textContent).toBe('Drink a flask: 3 marbles back · 1 left');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · army 11 marbles · pick a fight');
    expect(flask().textContent).toBe('Drink a flask: 3 marbles back · 1 left');
    flask().click();
    flask().click(); // a disabled button: nothing to drink
    expect(flask().disabled).toBe(true);
    expect(line()).toBe('Rogue-lite run · army 14 marbles · pick a fight');
  });

  it('a fight starts with 10 enemy marbles, its front row gone, and an elite with all 14, #1145', async () => {
    const whites = async (node: number, path: number[]): Promise<string[]> => {
      const game = await boot('?bot=off');
      await game.hook('__run', pick({ ...plainRun(3, 3), path }, node));
      playMove(game); // White to move: its legal moves show the marbles it has
      const cells = game.hook<Move[]>('__legal').flatMap((m) => m.cells.map((c) => c.join(',')));
      return [...new Set(cells)];
    };
    const fight = await whites(0, []);
    expect(fight).toContain('0,-3');
    expect(fight.some((c) => ['0,-2', '1,-2', '2,-2', '-1,-3'].includes(c))).toBe(false);
    expect(await whites(2, [0])).toContain('0,-2'); // an elite: the standard 14
  });

  it('an elite is a fight against the bot on the army board', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', pick({ ...plainRun(3, 3), path: [0] }, 2));
    expect(game.hud()).toContain('Rogue-lite run · act 1 elite · army 14 marbles');
    playMove(game);
    await game.settle();
    game.frame(1000);
    await game.settle();
    expect(game.hook('__plies')).toBe(2); // the bot answered
  });

  // Relics (#1457): a bar in the HUD, a treasure, an elite's and a boss's relic, and the army's fight board.
  const bar = (): string[] => [...document.querySelectorAll<HTMLElement>('#hud .relics .relic')].map((r) => r.title);
  const relics = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-relic]')];
  it('a treasure from the map waits for its relic, saved, and the relic taken joins the bar in the HUD', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(3, 3), path: [1], relics: [Relic.Jammer] });
    expect(bar()).toEqual([`Jammer: ${RELICS[Relic.Jammer]!.help}`]);
    expect(node(4).getAttribute('aria-label')).toBe('Act 1, treasure');
    node(4).click();
    expect(document.body.dataset.run).toBe('relic');
    expect(line()).toBe('Treasure · a chest holds a relic');
    expect(relics()).toHaveLength(1);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the relic waiting
    expect(document.body.dataset.run).toBe('relic');
    const found = Number(relics()[0]!.dataset.relic);
    relics()[0]!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(bar()).toEqual([`Jammer: ${RELICS[Relic.Jammer]!.help}`, `${RELICS[found]!.name}: ${RELICS[found]!.help}`]);
    expect(open().length).toBeGreaterThan(0);
  });

  it('a rest given up and a treasure given up take the Ruby and Sapphire keys, saved, counted on the map (#1467)', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(3, 3), army: 9, path: [1] });
    node(3).click();
    map().querySelector<HTMLButtonElement>('button[data-key="0"]')!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(map().querySelector('.run-keys')!.textContent).toContain('1 of 3 keys');
    expect(map().textContent).toContain('Ruby key');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(map().querySelector('.run-keys')!.textContent).toContain('Ruby');
    await game.hook('__run', { ...plainRun(3, 3), path: [1] });
    node(4).click();
    expect(document.body.dataset.run).toBe('relic');
    map().querySelector<HTMLButtonElement>('button[data-key="1"]')!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(bar()).toEqual([]);
    expect(map().querySelector('.run-keys')!.textContent).toContain('Sapphire');
  });

  it('an act boss beaten offers a boss relic among its 3, marked, with its cost in the rule (#1467)', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', { ...plainRun(3, 3), army: 12, path: [0, 2, 6, 9], reward: true, relic: true });
    const boss = map().querySelectorAll('button[data-boss-relic]');
    expect(boss).toHaveLength(1);
    expect(boss[0]!.textContent).toContain(' but ');
    (boss[0] as HTMLButtonElement).click();
    expect(bar()).toHaveLength(1);
    expect(Number(bar()[0] && RELICS.findIndex((r) => bar()[0]!.startsWith(r.name)))).toBeGreaterThanOrEqual(12);
  });

  it('an act boss beaten offers 3 relics, then its reward', async () => {
    const game = await boot('?bot=off');
    // Seed 3: the act 1 boss 9 is reached by 0, 2 and 6.
    await game.hook('__run', { ...plainRun(3, 3), army: 12, path: [0, 2, 6, 9], reward: true, relic: true });
    expect(document.body.dataset.run).toBe('relic');
    expect(line()).toBe('Boss beaten · pick a relic');
    expect(relics()).toHaveLength(3);
    relics()[1]!.click();
    expect(document.body.dataset.run).toBe('reward');
    expect(bar()).toHaveLength(1);
  });

  it('the army fights with its relics on its board, the bot too, and the bar stays in the HUD', async () => {
    const game = await boot('?nodes=50');
    const { Engine } = await import('abalone-wasm');
    const taken = vi.spyOn(Engine.prototype, 'set_relics');
    await game.hook('__run', pick({ ...plainRun(3, 3), relics: [Relic.Gyroscope, Relic.Detonator] }, 0));
    expect(document.body.dataset.run).toBe('fight');
    expect(taken).toHaveBeenLastCalledWith(0b10001);
    expect(bar()).toHaveLength(2);
    taken.mockClear();
    playMove(game);
    await game.settle();
    game.frame(1000);
    await game.settle();
    expect(game.hook('__plies')).toBe(2); // the bot answered on the same board
    expect(taken).toHaveBeenCalledWith(0b10001);
  });

  it('the act boss is a roster boss picked by the seed, at the act strength, with its deck, resumed on a reload', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?nodes=50', { indexedDB });
    const { Encounter } = await import('abalone-wasm');
    const strength = vi.spyOn(Encounter.prototype, 'scale_node_budget');
    const { state } = await bossRun('hull');
    await game.hook('__run', state);
    expect(document.body.dataset.run).toBe('fight');
    expect(document.body.dataset.boss).toBe('hull');
    expect(document.body.dataset.deck).not.toBe('mess');
    expect(game.hud()).toContain('Rogue-lite run · act 1 boss');
    playMove(game);
    await game.settle();
    game.frame(1000);
    await game.settle();
    expect(game.hook('__plies')).toBe(2); // the boss answered
    expect(strength).toHaveBeenCalledWith(50); // act 1: the easy budget, whatever the difficulty setting
    await boot('?nodes=50', { indexedDB });
    expect(document.body.dataset.boss).toBe('hull');
  });

  it('a lost act boss loses the run, and the next run fights on the local deck', async () => {
    const game = await boot('?bot=off');
    const { state, nodes } = await bossRun('echo');
    await game.hook('__run', state);
    // The Echo draws by repetition in 7 moves, the player taking the free moves it offers (#958), a loss against a boss
    // (e2e/fight-end.ts).
    const moves: [Axial, Axial][] = [
      [[0, 2], [0, 1]],
      [[0, -1], [1, -1]],
      [[0, 1], [-1, 1]],
      [[-1, 1], [0, 1]],
      [[0, -1], [1, -1]],
      [[0, 1], [-1, 1]],
      [[-1, 1], [0, 1]],
    ];
    for (const [from, to] of moves) play(game, [from], to);
    await game.settle();
    expect(document.body.dataset.run).toBe('lost');
    expect(line()).toBe('Run lost · 14 marbles left');
    await game.hook('__run', visit(nodes, plainRun(state.seed, 3), 0));
    expect(document.body.dataset.boss).toBeUndefined();
    expect(document.body.dataset.deck).toBe('mess');
  });

  // Unlocks between runs and the run summary (#801).
  const armies = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-commander]')];
  it('the start shows the unlocks; a new run starts with the Captain, an unlocked commander is picked, saved, and placed before the first fight', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    localStorage.setItem('ab-alone.roguelite', '1'); // an act won in an earlier run
    game.openModes();
    byId('roguelite').click();
    expect(armies().map((b) => b.disabled)).toEqual([false, false, true, true]);
    expect(armies().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']); // the Captain, with his Gyroscope
    expect(bar()).toEqual([expect.stringContaining('Gyroscope')]);
    armies()[1]!.click();
    expect(line()).toBe('Rogue-lite run · army 14 marbles, 2 Anchor · pick a fight');
    expect(armies()[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(bar()).toEqual([expect.stringContaining('Hull plating')]);
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · army 14 marbles, 2 Anchor · pick a fight');
    expect(bar()).toEqual([expect.stringContaining('Hull plating')]);
    open()[0]!.click();
    expect(document.body.dataset.run).toBe('place');
  });

  it('an act boss beaten counts at once: a run abandoned after it keeps the unlock, its own unlocks stay', async () => {
    const game = await boot('?bot=off');
    // Seed 3: the act 1 boss 9 is reached by 0, 2 and 6; won, its reward waits.
    await game.hook('__run', { ...plainRun(3, 0), army: 12, path: [0, 2, 6, 9], reward: true });
    expect(localStorage.getItem('ab-alone.roguelite')).toBe('1');
    expect(document.body.dataset.run).toBe('reward');
    expect(map().querySelectorAll('button[data-offer]')).toHaveLength(2); // its own unlocks: a marble or a Heavy
    game.openModes();
    byId('daily').click(); // the run is abandoned
    expect(localStorage.getItem('ab-alone.roguelite')).toBe('1');
  });

  it('a run over shows its summary and keeps the acts it won for the next runs', async () => {
    const game = await boot('?bot=off');
    // Seed 3: the act 1 boss 9 is reached by 0, 2 and 6, and leads to the first fight 10 of act 2, lost here.
    await game.hook('__run', { ...plainRun(3, 0), army: 3, path: [0, 2, 6, 9, 10], end: 'lost' });
    expect(document.body.dataset.run).toBe('lost');
    expect([...map().querySelectorAll('.run-help')].map((p) => p.textContent)).toEqual([
      'Path: act 1 Fight, Elite, Elite, Boss · act 2 Fight',
      'Fights: 4 won, 1 lost',
      'Army at the end: 3 marbles',
      'Unlocked: Anchor marbles, Shield marbles, The Warden commander',
    ]);
    expect(localStorage.getItem('ab-alone.roguelite')).toBe('1');
    byId('run-new').click();
    expect(document.body.dataset.run).toBe('map');
    expect(armies().map((b) => b.disabled)).toEqual([false, false, true, true]);
  });
});

describe('main.ts the rogue-lite run on the terrace (#1374)', () => {
  it('a fight board is framed from the Blender camera', async () => {
    const game = await startRun('?nodes=50');
    open()[0]!.click();
    await vi.waitFor(() => expect(document.body.dataset.scene).toBe('table-zero'));
    const view = game.hook<View>('__view');
    expect(view.polar).toBeCloseTo((40 * Math.PI) / 180);
    expect(view.distance).toBeGreaterThanOrEqual(13.6);
  });
});

// Tactics (#1460, docs/specs/roguelite.md section 11): buttons in the fight HUD, each a record of the move list.
describe('main.ts the rogue-lite tactics (#1460)', () => {
  const tactics = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('#hud .tactics button')];
  const button = (code: number): HTMLButtonElement => tactics().find((b) => b.dataset.tactic === String(code))!;
  const FIRST = [1, 1, -2, 2, 0, 0, 0, 0]; // (-2, 2) steps W
  /** A fight of node 0 whose first move is played: the bot answers on load. */
  const fight = (state: Partial<Run> = {}): Run => ({ ...pick({ ...plainRun(3, 3), tactics: [2, 3, 4, 1].slice(0, 3) }, 0), moves: [FIRST], ...state });
  async function answered(game: Game): Promise<void> {
    await game.settle();
    game.frame(1000);
    await game.settle();
    game.frame(1000);
  }
  const plies = (game: Game): number => game.hook<number>('__plies');

  it('shows a glyph button per tactic held in a fight, with its name and rule as the tooltip', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', fight({ moves: [] }));
    expect(tactics().map((b) => b.dataset.tactic)).toEqual(['2', '3', '4']);
    expect(button(2).title).toBe('Freeze: the bot skips its next turn');
    byId('hud').click(); // the plate itself: nothing happens
    document.querySelector<HTMLElement>('#hud .tactics')!.click();
    expect(tactics()).toHaveLength(3);
    expect(document.body.dataset.tactics).toBe('2,3,4');
    await game.hook('__run', fight({ moves: [], specials: [1, 0, 0, 0, 0, 0] }));
    expect(tactics().every((b) => b.disabled)).toBe(true); // special marbles are placed first
    await game.hook('__run', { ...fight(), tactics: [] });
    expect(tactics()).toHaveLength(0);
    expect(document.body.dataset.tactics).toBe('');
  });

  it('only the tactics the engine can play are enabled, and none while the bot thinks', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', fight({ tactics: [1, 2, 3] }));
    await answered(game);
    expect(tactics().map((b) => [b.dataset.tactic, b.disabled])).toEqual([['1', true], ['2', false], ['3', true]]); // a full back row, no special marble
    await game.hook('__run', fight({ tactics: [1, 2, 3], army: 12 }));
    await answered(game);
    expect(button(1).disabled).toBe(false);
  });

  it('Freeze costs no move: the bot skips its next turn, the tactic is gone, saved with its record', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?nodes=50', { indexedDB });
    await game.hook('__run', fight());
    await answered(game);
    expect(plies(game)).toBe(2);
    const mine = game.turn(); // the player's turn line
    button(2).click();
    expect(plies(game)).toBe(3);
    expect(tactics().map((b) => b.dataset.tactic)).toEqual(['3', '4']);
    expect(game.hook<number[][]>('__history')[2]).toEqual([0, 2, 0, 0, 0, 0, 0, 0]);
    playMove(game);
    game.frame(1000);
    await game.settle();
    expect(plies(game)).toBe(4); // the bot passed: no answer
    expect(game.turn()).toBe(mine);
    expect(game.hud()).toContain('turn passed');
    await game.settle();
    const again = await boot('?nodes=50', { indexedDB });
    expect(plies(again)).toBe(4); // the records replay
    expect(tactics().map((b) => b.dataset.tactic)).toEqual(['3', '4']);
  });

  it('Swap: pick it, then two marbles; it costs the move, the bot answers', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', fight({ specials: [1, 0, 0, 0, 0, 0], placed: [[0, 4, 1]] }));
    await answered(game);
    expect(button(3).disabled).toBe(false);
    button(3).click();
    expect(button(3).getAttribute('aria-pressed')).toBe('true');
    game.click(0, -4); // a marble of the bot: ignored
    game.click(0, 4);
    game.click(0, 4); // the same marble: ignored
    game.click(1, 3);
    expect(document.body.dataset.specials).toBe('1,3,1');
    expect(button(3)).toBeUndefined(); // used
    await answered(game);
    expect(plies(game)).toBe(4); // the swap, then the bot's answer
    expect(game.hook<number[][]>('__history')[2]).toEqual([0, 3, 0, 4, 1, 3, 0, 0]);
  });

  it('Swap of two marbles that cannot swap says so and keeps the tactic; the button again cancels', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', fight({ specials: [1, 0, 0, 0, 0, 0], placed: [[0, 4, 1]] }));
    await answered(game);
    button(3).click();
    game.click(-1, 3);
    game.click(-2, 3); // two plain marbles
    expect(game.hud()).toContain('those marbles cannot swap');
    expect(button(3).getAttribute('aria-pressed')).toBe('false');
    expect(plies(game)).toBe(2);
    button(3).click();
    button(3).click(); // pressed again: cancelled
    expect(button(3).getAttribute('aria-pressed')).toBe('false');
    game.click(0, 4); // a plain selection again
    expect(plies(game)).toBe(2);
  });

  it('Fall back undoes the last move and the bot\'s answer', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', fight());
    await answered(game);
    const before = game.hook<number[]>('__board');
    const mine = game.turn(); // the player's turn line
    expect(plies(game)).toBe(2);
    button(4).click();
    expect(game.hook<number[]>('__board')).not.toEqual(before);
    expect(game.hook<number[][]>('__history')[2]).toEqual([0, 4, 0, 0, 0, 0, 0, 0]);
    expect(tactics().map((b) => b.dataset.tactic)).toEqual(['2', '3']);
    expect(game.turn()).toBe(mine);
  });

  it('Reinforce puts a marble on the back row', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', fight({ tactics: [1], army: 12 }));
    await answered(game);
    const marbles = (): number => game.hook<number[]>('__board').filter((c) => c === 1).length;
    expect(marbles()).toBe(12);
    button(1).click();
    expect(marbles()).toBe(13);
    expect(tactics()).toHaveLength(0);
  });

  it('a tactic out of turn changes nothing', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', fight({ tactics: [2], moves: [] }));
    playMove(game);
    expect(plies(game)).toBe(1);
    button(2).disabled = false; // the engine would refuse it: White is to move
    button(2).click();
    expect(plies(game)).toBe(1);
    expect(tactics()).toHaveLength(1);
  });

  it('a won fight offers a tactic with its rewards, the hand full offers none', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(1, 3), army: 12, path: [0], reward: true, tactics: [1] });
    const offer = map().querySelector<HTMLButtonElement>('button[data-tactic-offer]')!;
    expect(map().querySelectorAll('button[data-offer]')).toHaveLength(3);
    const code = Number(offer.dataset.tacticOffer);
    offer.click();
    expect(document.body.dataset.run).toBe('map');
    expect(document.body.dataset.tactics).toBe(`1,${code}`);
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(document.body.dataset.tactics).toBe(`1,${code}`); // saved with the run
    await game.hook('__run', { ...plainRun(1, 3), army: 12, path: [0], reward: true, tactics: [1, 1, 1] });
    expect(map().querySelector('button[data-tactic-offer]')).toBeNull();
  });

  it('an act boss fight has no tactics', async () => {
    const game = await boot('?nodes=50');
    await game.hook('__run', { ...(await bossRun('hull')).state, tactics: [2] });
    expect(document.body.dataset.boss).toBeDefined();
    expect(tactics()).toHaveLength(0);
  });
});

describe('main.ts, the varied enemy armies of a run (#1462)', () => {
  /** The act 1 nodes of `seed`'s map of the `kind` with the path that walks to each, by the first link back. */
  async function nodesOf(seed: number, kind: string): Promise<{ nodes: MapNode[]; found: { index: number; path: number[] }[] }> {
    const { run_map } = await import('abalone-wasm');
    const nodes = parseMap(run_map(seed));
    const found = nodes.flatMap((n, index) => {
      if (n.kind !== kind || n.act !== 0) return [];
      const path = [index];
      for (let m = n; m.row > 0; ) {
        const prev = nodes.findIndex((o) => o.act === 0 && o.row === m.row - 1 && o.links.includes(m.col));
        path.unshift(prev);
        m = nodes[prev]!;
      }
      return [{ index, path }];
    });
    return { nodes, found };
  }
  const whites = (game: Game): number => game.hook<number[]>('__board').filter((c) => c === 2).length;
  /** The plan the bridge deals for a node as the board dataset lists its special marbles: `q,r,kind`, cell by cell. */
  async function listed(seed: number, index: number): Promise<string> {
    const { run_foes } = await import('abalone-wasm');
    const plan = Array.from(run_foes(seed, index, 0, 0)).slice(3);
    const marks = Array.from({ length: plan.length / 3 }, (_, i) => plan.slice(3 * i, 3 * i + 3));
    return marks.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!).map((m) => m.join(',')).join(' ');
  }

  it('a fight stands the formation of its node with an enemy special marble, and the HUD names the formation', async () => {
    const game = await boot('?bot=off');
    let seed = 1;
    let pickable: { index: number; path: number[] } | undefined;
    for (; !pickable; seed++) {
      const { nodes, found } = await nodesOf(seed, 'fight');
      pickable = found.find((f) => nodes[f.index]!.formation > 0);
    }
    seed--;
    const { nodes } = await nodesOf(seed, 'fight');
    const { index, path } = pickable;
    await game.hook('__run', pick({ ...newRun(seed, 3, LEGACY_UNLOCKED), path: path.slice(0, -1) }, index));
    expect(whites(game)).toBe(10);
    expect(document.body.dataset.specials).toBe(await listed(seed, index));
    expect(document.body.dataset.specials).not.toBe('');
    expect(game.hud()).toContain(`act 1 fight · ${FORMATIONS[nodes[index]!.formation]} · army 14 marbles`);
    // The same node of a run saved before: the standard army of 10, none special, nothing named.
    await game.hook('__run', pick({ ...plainRun(seed, 3), path: path.slice(0, -1) }, index));
    expect(whites(game)).toBe(10);
    expect(document.body.dataset.specials).toBe('');
    expect(game.hud()).not.toContain(FORMATIONS[nodes[index]!.formation]!);
  });

  it('an elite stands 14 marbles with its archetype\'s special marbles, named on the map and in the HUD', async () => {
    const game = await boot('?bot=off');
    let seed = 1;
    while (!(await nodesOf(seed, 'elite')).found.length) seed++;
    const { nodes, found } = await nodesOf(seed, 'elite');
    const { index, path } = found[0]!;
    const elite = ELITES[nodes[index]!.elite - 1]!;
    const run = pick({ ...newRun(seed, 3, LEGACY_UNLOCKED), path: path.slice(0, -1) }, index);
    await game.hook('__run', run);
    expect(whites(game)).toBe(14);
    expect(document.body.dataset.specials).toBe(await listed(seed, index));
    expect(game.hud()).toContain(`act 1 elite · ${elite.name}`);
    await game.hook('__run', { ...run, fighting: false, path: path.slice(0, -1) });
    const node = map().querySelector(`button[data-node="${index}"]`)!;
    expect(node.getAttribute('aria-label')).toBe(`Act 1, elite, ${elite.name}, marked: its key`);
    expect(node.textContent).toBe(`Elite${elite.name.replace('The ', '')} · key`);
  });
});

describe('main.ts, the Collector between acts (#1470)', () => {
  const KEY = 'ab-alone.roguelite.blueprints';
  /** A run of seed 1 at its act 1 boss beaten, in the Collector with `cells` and the blueprints `carried`. */
  async function inCollector(game: Game, cells: number, carried: number[]): Promise<void> {
    const { run_map } = await import('abalone-wasm');
    const path = toBoss(parseMap(run_map(1)));
    await game.hook('__run', { ...plainRun(1, 3), path, collector: true, cells, carried });
  }

  it('shows the room after the act boss; a blueprint banked is kept for later runs, spends the cells and is saved with the run', async () => {
    localStorage.removeItem(KEY);
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await inCollector(game, 12, [0, 8]);
    expect(document.body.dataset.run).toBe('collector');
    expect(line()).toBe('Collector · 12 cells');
    expect(open()).toHaveLength(0); // the map waits
    map().querySelector<HTMLButtonElement>('button[data-collect="8"]')!.click();
    expect(localStorage.getItem(KEY)).toBe('[8]');
    expect(line()).toBe('Collector · 7 cells');
    expect(map().querySelectorAll('button[data-collect]')).toHaveLength(1);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the room as it was
    expect(document.body.dataset.run).toBe('collector');
    expect(line()).toBe('Collector · 7 cells');
    map().querySelector<HTMLButtonElement>('button[data-depart]')!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(open().length).toBeGreaterThanOrEqual(2); // the first row of act 2
    expect(line()).toBe('Rogue-lite run · army 14 marbles · 7 cells · 1 blueprint · pick a fight');
  });

  it('a blueprint the cells cannot pay stays on the shelf', async () => {
    localStorage.removeItem(KEY);
    const game = await boot('?bot=off');
    await inCollector(game, 4, [0]);
    expect(map().querySelector<HTMLButtonElement>('button[data-collect]')!.disabled).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('a new run starts with the blueprints banked before it', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    byId('roguelite').click();
    expect(map().textContent).toContain('Blueprints to bank: 14');
    localStorage.setItem(KEY, '[0,1]'); // two banked in earlier runs
    game.openModes();
    byId('roguelite').click();
    expect(map().textContent).toContain('Blueprints to bank: 12');
  });
});

describe('main.ts, the scroll of power between acts (#1471)', () => {
  const scrolls = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-scroll]')];
  const chips = (): string[] => [...document.querySelectorAll<HTMLElement>('#hud .affinities .affinity')].map((c) => c.title);

  it('waits after the act boss, saved; a scroll grows its affinity, joins the bar next to the relics, and the map goes on', async () => {
    const { run_map } = await import('abalone-wasm');
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...plainRun(1, 3), path: toBoss(parseMap(run_map(1))), scroll: true, relics: [Relic.Jammer] });
    expect(document.body.dataset.run).toBe('scroll');
    expect(line()).toBe('Act 1 done · pick a scroll of power');
    expect(scrolls()).toHaveLength(3);
    expect(open()).toHaveLength(0); // the map waits
    expect(chips()).toEqual([]);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the scroll waiting
    expect(document.body.dataset.run).toBe('scroll');
    scrolls()[2]!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(chips()).toEqual(['Chaos 1: the burst of a Spark or a Bomb pushes 1 cell further']);
    expect(document.querySelector('#hud .relics')!.nextElementSibling!.classList.contains('affinities')).toBe(true);
    expect(open().length).toBeGreaterThanOrEqual(2); // the first row of act 2
    await game.settle();
    await boot('?bot=off', { indexedDB }); // and keeps the affinity
    expect(chips()).toEqual(['Chaos 1: the burst of a Spark or a Bomb pushes 1 cell further']);
  });

  it('comes before the Collector', async () => {
    const { run_map } = await import('abalone-wasm');
    const game = await boot('?bot=off');
    await game.hook('__run', { ...plainRun(1, 3), path: toBoss(parseMap(run_map(1))), scroll: true, collector: true, cells: 12, carried: [0] });
    expect(document.body.dataset.run).toBe('scroll');
    scrolls()[0]!.click();
    expect(document.body.dataset.run).toBe('collector');
  });
});

describe('main.ts, the biome exits between acts (#1472)', () => {
  /** The path of the run of seed 1 from the first node of act `act` (0 or 1) to its boss, by first links. */
  async function actPath(act: number): Promise<{ nodes: MapNode[]; path: number[] }> {
    const { run_map } = await import('abalone-wasm');
    const nodes = parseMap(run_map(1));
    const path = [nodes.findIndex((n) => n.act === act && n.row === 0)];
    for (let n = nodes[path[0]!]!; n.kind !== 'boss'; ) {
      path.push(nodes.findIndex((m) => m.act === act && m.row === n.row + 1 && m.col === n.links[0]));
      n = nodes[path[path.length - 1]!]!;
    }
    return { nodes, path };
  }
  /** The run at its act 1 boss beaten, the exits waiting. */
  async function atExits(game: Game): Promise<void> {
    await game.hook('__run', { ...newRun(1, 3, LEGACY_UNLOCKED), path: (await actPath(0)).path, exit: true });
  }
  const exitButtons = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-exit]')];

  it('shows the two exits after the act boss; a pick tints the map, names the biome, is saved, and opens the biome\'s holes in the next fights', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    const { run_exits } = await import('abalone-wasm');
    await atExits(game);
    expect(document.body.dataset.run).toBe('exit');
    expect(document.body.dataset.biome).toBeUndefined(); // act 1 is the Meadow
    expect(line()).toBe('Act 1 done · pick the exit to act 2');
    expect(open()).toHaveLength(0); // the map waits
    expect(exitButtons().map((b) => b.dataset.exit)).toEqual(Array.from(run_exits(1, 1, 0)).map(String));
    for (const b of exitButtons()) expect(b.textContent).toMatch(/ · boss: [A-Z]/);
    const exit = exitButtons()[1]!;
    const biome = BIOMES[Number(exit.dataset.exit)]!;
    expect(exit.dataset.biome).toBe(biome.id);
    exit.click();
    expect(document.body.dataset.run).toBe('map');
    expect(document.body.dataset.biome).toBe(biome.id);
    expect(line()).toBe(`Rogue-lite run · ${biome.name} · army 14 marbles · pick a fight`);
    expect(open().length).toBeGreaterThanOrEqual(2);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the pick
    expect(document.body.dataset.biome).toBe(biome.id);
    open()[0]!.click();
    expect(document.body.dataset.run).toBe('fight');
    expect(document.body.dataset.biome).toBe(biome.id);
    expect(document.body.dataset.specials).toContain(',');
    expect(byId('hud').textContent).toContain(`act 2 fight · ${biome.name}`);
  });

  it('a reload at the exits keeps them waiting, and a run saved before them goes on with no exit', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await atExits(game);
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(document.body.dataset.run).toBe('exit');
    expect(exitButtons()).toHaveLength(2);
    const old = await boot('?bot=off');
    await old.hook('__run', { ...newRun(1, 3, LEGACY_UNLOCKED), exits: false, path: (await actPath(0)).path });
    expect(document.body.dataset.run).toBe('map'); // the first row of act 2, in the Meadow
    expect(document.body.dataset.biome).toBeUndefined();
  });

  it('the fight of a biome stands its holes on the board: a hole is not a cell', async () => {
    const game = await boot('?bot=off');
    const first = (await actPath(1)).path[0]!;
    for (const biome of [1, 2, 3, 4, 5]) {
      await game.hook('__run', pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: (await actPath(0)).path, biomes: [biome] }, first));
      const board = game.hook<number[]>('__board');
      expect(board.filter((c) => c === 3).length, BIOMES[biome]!.name).toBeGreaterThan(0); // 3: a vanished cell
    }
    await game.hook('__run', pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: (await actPath(0)).path }, first));
    expect(game.hook<number[]>('__board').filter((c) => c === 3)).toHaveLength(0);
  });

  it('the act boss of a biome is the biome\'s, and the tint stays on its fight', async () => {
    const { path, nodes } = await actPath(1);
    const game = await boot('?bot=off');
    await game.hook('__run', pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [...(await actPath(0)).path, ...path.slice(0, -1)], biomes: [2] }, path[path.length - 1]!));
    expect(nodes[path[path.length - 1]!]!.kind).toBe('boss');
    expect(document.body.dataset.boss).toBe(BIOMES[2]!.boss);
    expect(document.body.dataset.biome).toBe('tundra');
  });
});

// Ascension (#1465, docs/specs/roguelite.md section 20): the level is picked on the start screen next to the commander, a run won
// at level N unlocks N + 1.
describe('main.ts, the ascension levels of a run (#1465)', () => {
  const levels = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-ascension]')];

  it('the start screen picks a level unlocked by an earlier win; it is saved with the run and resumed on reload', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    localStorage.setItem('ab-alone.roguelite.ascension', '7'); // levels 1 to 7 unlocked
    game.openModes();
    byId('roguelite').click();
    expect(levels().map((b) => b.disabled)).toEqual([false, false, false, false, false, false, false, false, true, true, true]);
    expect(levels()[0]!.getAttribute('aria-pressed')).toBe('true');
    levels()[6]!.click(); // level 6 starts with 12 marbles
    expect(line()).toBe('Rogue-lite run · ascension 6 · army 12 marbles · pick a fight');
    expect(levels()[6]!.getAttribute('aria-pressed')).toBe('true');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · ascension 6 · army 12 marbles · pick a fight');
    open()[0]!.click();
    expect(game.hud()).toContain('ascension 6');
    localStorage.clear();
  });

  it('level 3 stands one more special marble on the bot, level 8 two', async () => {
    const game = await boot('?bot=off');
    const stand = async (ascension: number): Promise<number> => {
      await game.hook('__run', { ...pick({ ...newRun(3, 3, LEGACY_UNLOCKED, 10), ascension }, 0) });
      return document.body.dataset.specials!.split(' ').filter(Boolean).length;
    };
    expect([await stand(0), await stand(3), await stand(8)]).toEqual([1, 2, 3]);
  });

  it('a run won at level 2 unlocks level 3 at once, and says so in its summary', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', { ...plainRun(3, 0), ascension: 2, top: 2, army: 8, path: [0, 2, 6, 9, 10], end: 'won' });
    expect(localStorage.getItem('ab-alone.roguelite.ascension')).toBe('3');
    expect([...map().querySelectorAll('.run-help')].map((p) => p.textContent)).toContain('Ascension: 2');
    expect([...map().querySelectorAll('.run-help')].map((p) => p.textContent).join()).toContain('Ascension 3');
    localStorage.clear();
  });
});

describe('main.ts, the map scrolls to the nodes to pick (#1468)', () => {
  it('after a pick, puts the first node that can be picked in the middle of the plate, and leaves a screen without nodes at its top', async () => {
    const game = await boot('?bot=off');
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.matches('button.node:not(:disabled)') ? 700 : 100 } as DOMRect;
    });
    Object.defineProperty(map(), 'clientHeight', { configurable: true, value: 200 });
    await game.hook('__run', { ...plainRun(3, 3), army: 9, path: [] });
    expect(map().scrollTop).toBe(0); // before the first pick the commanders stay in view above the map
    await game.hook('__run', { ...plainRun(3, 3), army: 9, path: [0, 2, 6, 9] });
    expect(map().scrollTop).toBe(500); // 700 - 100 - half of 200
    await game.hook('__run', { ...plainRun(3, 3), army: 9, path: [0, 2, 6, 9], end: 'lost' });
    expect(map().scrollTop).toBe(500); // the end of a run has no node: the plate is left where it is
    rect.mockRestore();
  });
});

describe('main.ts the rogue-lite score, daily run, history and compendium (#1466)', () => {
  const today = (): string => new Date().toISOString().slice(0, 10);
  const bookButton = (name: string): HTMLButtonElement => map().querySelector<HTMLButtonElement>(`button[data-book="${name}"]`)!;
  const dailyButton = (): HTMLButtonElement => map().querySelector<HTMLButtonElement>('button[data-daily]')!;
  // Seed 3: the act 1 boss 9 is reached by 0, 2 and 6, and leads to the first fight 10 of act 2, lost here.
  const lostRun = (state: Partial<Run> = {}): Run => ({ ...plainRun(3, 0), army: 3, path: [0, 2, 6, 9, 10], end: 'lost', ...state });

  it('the start screen offers the daily run, the run history and the compendium; the first pick takes them away', async () => {
    const game = await startRun('?bot=off');
    expect(dailyButton().textContent).toBe(`Daily run ${today()}`);
    expect(dailyButton().disabled).toBe(false);
    expect(bookButton('history').textContent).toBe('Run history');
    expect(bookButton('compendium').textContent).toBe('Compendium');
    open()[0]!.click();
    expect(map().querySelector('.run-book')).toBeNull();
    await game.settle();
  });

  it('the daily run plays the seed of the day, once: it is saved, resumed, and its button is spent', async () => {
    const { dailySeed } = await import('./daily');
    const indexedDB = new IDBFactory();
    const game = await startRun('?bot=off', indexedDB);
    dailyButton().click();
    expect(line()).toBe(`Daily run ${today()} · army 14 marbles · pick a fight`);
    expect(map().querySelectorAll('button[data-commander]')).toHaveLength(4);
    expect([...map().querySelectorAll<HTMLButtonElement>('button[data-commander]')].every((b) => !b.disabled)).toBe(true); // everything unlocked, for everyone
    expect(dailyButton().textContent).toBe(`Daily run ${today()} · tried today, back tomorrow`); // one try a day
    expect(dailyButton().disabled).toBe(true);
    const { run_map } = await import('abalone-wasm');
    const expected = parseMap(run_map(dailySeed(today()))).filter((n) => n.act === 0 && n.row === 0).map((n) => `Act 1, ${n.kind}`);
    expect(open().map((b) => b.getAttribute('aria-label'))).toEqual(expected); // the map of the seed of the day
    expect(localStorage.getItem('ab-alone.roguelite.daily')).toBe(JSON.stringify({ day: today(), score: null }));
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe(`Daily run ${today()} · army 14 marbles · pick a fight`); // resumed
  });

  it('a daily run over keeps its score, the button then shows it and stays shut, and the history lists the run', async () => {
    const game = await startRun('?bot=off');
    const { dailyRun } = await import('./roguelite');
    localStorage.setItem('ab-alone.roguelite.daily', JSON.stringify({ day: today(), score: null }));
    await game.hook('__run', { ...dailyRun(today(), 3), army: 3, path: [0, 2, 6, 9, 10], end: 'lost' });
    expect(map().querySelector('.run-score')!.textContent).toBe('Score: 180 (acts 1 × 100, elites 2 × 25, marbles 3 × 10)');
    expect(JSON.parse(localStorage.getItem('ab-alone.roguelite.daily')!)).toEqual({ day: today(), score: 180 });
    byId('run-new').click();
    expect(dailyButton().textContent).toBe(`Daily run ${today()} · score 180, back tomorrow`);
    expect(dailyButton().disabled).toBe(true);
    bookButton('history').click();
    expect(map().querySelector('.run-line')!.textContent).toBe('Run history');
    expect([...map().querySelectorAll('li')].map((li) => li.textContent)).toEqual([`The Captain · lost · score 180 · daily ${today()}`]);
    map().querySelector<HTMLButtonElement>('button[data-book="map"]')!.click();
    expect(line()).toContain('Rogue-lite run');
    expect(bookButton('history')).not.toBeNull();
  });

  it('a run over is in the history once, with its score, newest first', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', lostRun());
    expect(map().querySelector('.run-score')!.textContent).toBe('Score: 180 (acts 1 × 100, elites 2 × 25, marbles 3 × 10)');
    await game.hook('__run', lostRun()); // shown again: not twice
    await game.hook('__run', lostRun({ seed: 4, path: [0], army: 3 }));
    byId('run-new').click();
    bookButton('history').click();
    expect([...map().querySelectorAll('li')].map((li) => li.textContent)).toEqual(['No commander · lost · score 30', 'No commander · lost · score 180']);
  });

  it('the compendium shows what the runs held, the rest as silhouettes', async () => {
    const game = await boot('?bot=off');
    await game.hook('__run', { ...plainRun(3, 0), relics: [Relic.Jammer], path: [0] });
    game.openModes();
    byId('roguelite').click();
    bookButton('compendium').click();
    expect(map().querySelector('.run-line')!.textContent).toMatch(/^Compendium · 2 of \d+ seen$/);
    const seen = [...map().querySelectorAll('li.seen')].map((li) => li.textContent);
    expect(seen).toEqual([relicText(Relic.Gyroscope), relicText(Relic.Jammer)]); // the new run's Captain brings his Gyroscope
    expect(map().querySelectorAll('li.unseen svg.silhouette').length).toBeGreaterThan(10);
    map().querySelector<HTMLButtonElement>('button[data-book="map"]')!.click();
    expect(bookButton('compendium')).not.toBeNull();
    expect(localStorage.getItem('ab-alone.roguelite.seen')).toContain('"relics":[0,3]');
  });
});

// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { Axial, Move } from './board';
import { actBoss, newRun, parseMap, pick, visit, type MapNode, type Run } from './roguelite';
import type { View } from './camera';
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
  game.frame(1000); // then the Echo's bonus slide (#958)
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
    await game.hook('__run', pick({ ...newRun(3, 3), army: 4, path: [0] }, 2)); // an elite (14 White): the army keeps (1, 3), (-2, 2), (-1, 2), (0, 2)
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
    await first.hook('__run', pick(newRun(1, 3), 0));
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
    await game.hook('__run', pick({ ...newRun(1, 3), specials: [1, 0, 2] }, 0));
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

  it('a won fight offers a reward, its pick goes back to the map', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...newRun(1, 3), army: 12, path: [0], reward: true });
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
    await game.hook('__run', { ...pick({ ...newRun(3, 3), army: 4, specials: [1, 0, 1], path: [0] }, 2), placed: [[1, 3, 3], [0, 2, 1]] });
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

  it('the bot replays the fight with its special marbles: a Heavy push the plain board refuses, #961', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...pick({ ...newRun(3, 3), specials: [1, 0, 0], path: [0] }, 2), placed: [[0, 4, 1]] });
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
  // Elites, rests, events and act bosses (#800). Seed 3: node 0 leads to the elite 2, the fight 1 to the rest 3 and the
  // events 4 and 5.
  const node = (i: number): HTMLButtonElement => map().querySelector<HTMLButtonElement>(`button[data-node="${i}"]`)!;
  it('a rest from the map brings the army back to 14 with no fight, saved with the run', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...newRun(3, 3), army: 9, path: [1] });
    expect(node(3).getAttribute('aria-label')).toBe('Act 1, rest');
    expect(node(2).className).toBe('node elite');
    node(3).click();
    expect(document.body.dataset.run).toBe('map');
    expect(line()).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
  });

  it.each([['1', 'taken'], ['0', 'left']])('an event waits for its choice, %s: %s, then the map goes on', async (choice) => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    await game.hook('__run', { ...newRun(3, 3), army: 12, specials: [0, 0, 1], path: [1] });
    node(4).click();
    expect(document.body.dataset.run).toBe('event');
    expect(line()).toMatch(/^Event · /);
    await game.settle();
    await boot('?bot=off', { indexedDB }); // a reload keeps the event waiting
    expect(document.body.dataset.run).toBe('event');
    map().querySelector<HTMLElement>(`button[data-choice="${choice}"]`)!.click();
    expect(document.body.dataset.run).toBe('map');
    const before = 'Rogue-lite run · army 12 marbles, 1 Spark · pick a fight';
    if (choice === '1') expect(line()).not.toBe(before);
    else expect(line()).toBe(before);
  });

  it('a fight starts with 10 enemy marbles, its front row gone, and an elite with all 14, #1145', async () => {
    const whites = async (node: number, path: number[]): Promise<string[]> => {
      const game = await boot('?bot=off');
      await game.hook('__run', pick({ ...newRun(3, 3), path }, node));
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
    await game.hook('__run', pick({ ...newRun(3, 3), path: [0] }, 2));
    expect(game.hud()).toContain('Rogue-lite run · act 1 elite · army 14 marbles');
    playMove(game);
    await game.settle();
    game.frame(1000);
    await game.settle();
    expect(game.hook('__plies')).toBe(2); // the bot answered
  });

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
      const state = pick({ ...newRun(seed, 3), path: path.slice(0, -1) }, path[path.length - 1]!);
      if (actBoss(nodes, state, boss_ids())?.id === id) return { state, nodes };
    }
  }

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
    await game.hook('__run', visit(nodes, newRun(state.seed, 3), 0));
    expect(document.body.dataset.boss).toBeUndefined();
    expect(document.body.dataset.deck).toBe('mess');
  });

  // Unlocks between runs and the run summary (#801).
  const armies = (): HTMLButtonElement[] => [...map().querySelectorAll<HTMLButtonElement>('button[data-army]')];
  it('the start shows the unlocks; an unlocked starting army is picked, saved, and placed before the first fight', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { indexedDB });
    localStorage.setItem('ab-alone.roguelite', '1'); // an act won in an earlier run
    game.openModes();
    byId('roguelite').click();
    expect(armies().map((b) => b.disabled)).toEqual([false, false, true, true]);
    armies()[1]!.click();
    expect(line()).toBe('Rogue-lite run · army 14 marbles, 2 Anchor · pick a fight');
    expect(armies()[1]!.getAttribute('aria-pressed')).toBe('true');
    await game.settle();
    await boot('?bot=off', { indexedDB });
    expect(line()).toBe('Rogue-lite run · army 14 marbles, 2 Anchor · pick a fight');
    open()[0]!.click();
    expect(document.body.dataset.run).toBe('place');
  });

  it('an act boss beaten counts at once: a run abandoned after it keeps the unlock, its own unlocks stay', async () => {
    const game = await boot('?bot=off');
    // Seed 3: the act 1 boss 9 is reached by 0, 2 and 6; won, its reward waits.
    await game.hook('__run', { ...newRun(3, 0), army: 12, path: [0, 2, 6, 9], reward: true });
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
    await game.hook('__run', { ...newRun(3, 0), army: 3, path: [0, 2, 6, 9, 10], end: 'lost' });
    expect(document.body.dataset.run).toBe('lost');
    expect([...map().querySelectorAll('.run-help')].map((p) => p.textContent)).toEqual([
      'Path: act 1 Fight, Elite, Elite, Boss · act 2 Fight',
      'Fights: 4 won, 1 lost',
      'Army at the end: 3 marbles',
      'Unlocked: Anchor marbles, Bulwark army',
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

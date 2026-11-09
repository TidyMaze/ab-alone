// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { indexedDbStore } from './idb';
import './test/openworldwasm';
import { world_enemies } from 'edgefall-wasm';
import { boot, type Game } from './test/harness';

// The Workshop and the special marbles of the wild fights (#1655, Decision #1654, docs/specs/openworld.md section 19.2).
const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const data = () => document.body.dataset;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
};
type Stock = { resources?: { wood: number; ore: number; parts: number; shards: number }; army?: { specials: number[]; brought: number[]; relics: number[]; relicsBrought: number[] } };
type Hooks = { __openworldFixture: (f: { hero: Axial; troop: Axial[]; enemies?: Axial[] } & Stock) => void };
const hooks = () => window as unknown as Hooks;
const rich = { wood: 20, ore: 20, parts: 40, shards: 0 };
const army = (specials: number[], brought: number[]) => ({ specials, brought, relics: [], relicsBrought: [] });

/** Opens the world of seed 7, loads `stock`, rolls onto its first town. */
async function inTown(game: Game, stock: Stock): Promise<Axial> {
  game.openModes();
  byId('openworld').click();
  await settle();
  const [q, r] = data().openworldPlaces!.split(' ').find((p) => p.startsWith('town:'))!.slice(5).split(',').map(Number) as unknown as Axial;
  hooks().__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [], ...stock });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  await settle();
  return [q - 1, r];
}
const open = async (): Promise<void> => {
  byId('workshop-open').click();
  await settle();
};
const press = async (kind: number, act: string): Promise<void> => {
  document.querySelector<HTMLButtonElement>(`#workshop button[data-kind="${kind}"][data-act="${act}"]`)!.click();
  await settle();
};
const text = (id: string): string => byId(id).textContent!;

describe('the Workshop station of the Hub (#1655)', () => {
  it('shows in the Hub of a town of the Open world, not in the Hub of the mode menu', async () => {
    const menu = await boot('?bot=off');
    menu.openModes();
    byId('ship').click();
    expect(data().hub).toBeTruthy();
    expect(byId('workshop-open').hidden).toBe(true);
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, {});
    expect(data().hub).toBeTruthy();
    expect(byId('workshop-open').hidden).toBe(false);
    expect(byId('workshop-open').textContent).toBe('Workshop');
    expect(byId('workshop').hidden).toBe(true);
  });

  it('opens a sheet with the stock of the world, closes with Close and Esc, and the focus goes back to the button', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, { resources: { wood: 12, ore: 7, parts: 20, shards: 2 } });
    await open();
    expect(byId('workshop').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('workshop'));
    expect(text('workshop-stock')).toBe('Wood 12 · Ore 7 · Parts 20 · Shards 2');
    expect(text('workshop-army')).toBe('Army 0 / 6 · Bringing 0 / 3');
    byId('workshop-close').click();
    expect(byId('workshop').hidden).toBe(true);
    expect(document.activeElement).toBe(byId('workshop-open'));
    await open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(byId('workshop').hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); // nothing open: nothing
    expect(byId('workshop').hidden).toBe(true);
  });

  it('the arrows of the Hub do not roll the marble while the sheet is open', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, {});
    const at = data().hub;
    await open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(data().hub).toBe(at);
    byId('workshop-close').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(data().hub).not.toBe(at);
  });

  it('buys, sells and chooses the loadout, and the sheet reads the save back: a Heavy for 6 ore and 4 parts, 3 ore and 2 parts back', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, { resources: rich });
    await open();
    await press(1, 'buy');
    expect(text('workshop-stock')).toBe('Wood 20 · Ore 14 · Parts 36 · Shards 0');
    expect(text('workshop-army')).toBe('Army 1 / 6 · Bringing 0 / 3');
    expect(document.activeElement).toBe(document.querySelector('#workshop button[data-kind="1"][data-act="buy"]'));
    await press(1, 'bring');
    expect(text('workshop-army')).toBe('Army 1 / 6 · Bringing 1 / 3');
    expect(document.querySelector<HTMLButtonElement>('#workshop button[data-kind="1"][data-act="bring"]')!.disabled).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('#workshop button[data-kind="1"][data-act="buy"]')); // the pressed button is disabled: the first enabled one of its row
    await press(1, 'leave');
    expect(text('workshop-army')).toBe('Army 1 / 6 · Bringing 0 / 3');
    await press(1, 'bring');
    await press(10, 'buy'); // 6 wood and 6 parts
    await press(10, 'sell'); // half back
    expect(text('workshop-stock')).toBe('Wood 17 · Ore 14 · Parts 33 · Shards 0');
    byId('workshop-close').click();
    await open(); // the save, read again
    expect(text('workshop-stock')).toBe('Wood 17 · Ore 14 · Parts 33 · Shards 0');
    expect(text('workshop-army')).toBe('Army 1 / 6 · Bringing 1 / 3');
    await press(1, 'sell'); // the brought Heavy goes with it
    expect(text('workshop-stock')).toBe('Wood 17 · Ore 17 · Parts 35 · Shards 0');
    expect(text('workshop-army')).toBe('Army 0 / 6 · Bringing 0 / 3');
  });

  it('a disabled button says why, and the army owns at most six', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, { resources: { wood: 3, ore: 3, parts: 3, shards: 0 }, army: army([1], []) });
    await open();
    const buy = (kind: number) => document.querySelector<HTMLButtonElement>(`#workshop button[data-kind="${kind}"][data-act="buy"]`)!;
    expect(buy(1).disabled).toBe(true);
    expect(buy(1).title).toBe('not enough ore and parts');
    expect(document.querySelector('#workshop li[data-kind="1"] .w-why')!.textContent).toBe('not enough ore and parts');
    byId('workshop-close').click();
    await boot('?bot=off&openworld=7'); // another page: nothing of the first leaks in
    const full = await boot('?bot=off&openworld=7');
    await inTown(full, { resources: { wood: 99, ore: 99, parts: 99, shards: 0 }, army: army([1, 1, 2, 2, 3, 3], []) });
    await open();
    expect(buy(8).disabled).toBe(true);
    expect(buy(8).title).toBe('army full');
    await press(1, 'sell');
    expect(buy(8).disabled).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('#workshop button[data-kind="1"][data-act="sell"]')); // one more to sell: the focus stays
  });

  it('keeps the focus in the sheet when the row has no button left to press', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, { resources: { wood: 0, ore: 0, parts: 0, shards: 0 }, army: army([1], []) });
    await open();
    await press(1, 'sell'); // 3 ore and 2 parts back: not enough for another, and none left to sell, bring or leave
    expect(document.querySelectorAll('#workshop li[data-kind="1"] button:not(:disabled)').length).toBe(0);
    expect(document.activeElement).toBe(byId('workshop'));
  });

  it('a click on the sheet that is no button does nothing, and a button of a closed sheet neither', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, { resources: rich });
    await open();
    byId('workshop-body').click();
    const buy = document.querySelector<HTMLButtonElement>('#workshop button[data-kind="1"][data-act="buy"]')!;
    byId('workshop-close').click();
    buy.click();
    await settle();
    await open();
    expect(text('workshop-stock')).toBe('Wood 20 · Ore 20 · Parts 40 · Shards 0');
  });

  it('is closed with the Hub: leaving to the world hides the button and the sheet, and a sheet still loading stays shut', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, {});
    byId('workshop-open').click();
    byId('exit').click(); // the Hub is left before the save is read
    await settle();
    expect(byId('workshop').hidden).toBe(true);
    expect(byId('workshop-open').hidden).toBe(true);
    await inTown(game, {});
    await open();
    expect(byId('workshop').hidden).toBe(false);
    byId('exit').click();
    await settle();
    expect(byId('workshop').hidden).toBe(true);
  });

  it('opens on an empty stock when the world has no save', async () => {
    const game = await boot('?bot=off&openworld=7');
    await inTown(game, { resources: rich });
    await indexedDbStore().delete('openworld:7'); // the save is gone
    await open();
    expect(text('workshop-stock')).toBe('Wood 0 · Ore 0 · Parts 0 · Shards 0');
    expect(text('workshop-army')).toBe('Army 0 / 6 · Bringing 0 / 3');
  });
});

// The wild fight (docs/specs/openworld.md section 3c) with the special marbles of the army placed on its side.
type Move = { cells: Axial[]; dir: number };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
const { seed, home } = (() => {
  for (let n = 1; n < 100; n++) {
    for (const [cx, cy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as Axial[]) {
      const flat = world_enemies(n, cx, cy);
      for (let i = 0; i < flat.length; i += 2) if (Math.max(Math.abs(flat[i]!), Math.abs(flat[i + 1]!), Math.abs(flat[i]! + flat[i + 1]!)) <= 10) return { seed: n, home: [flat[i]!, flat[i + 1]!] as Axial };
    }
  }
  throw new Error('no seed');
})();
const beside: Axial = [home[0] + 1, home[1]];
const specials = (): number[] => (data().specials ?? '').split(' ').filter(Boolean).map((s) => Number(s.split(',')[2])).sort((a, b) => a - b);

afterEach(() => vi.useRealTimers());

describe('the special marbles in a wild fight (#1655)', () => {
  /** A world with the stock loaded and the hero put next to a marble: the wipe closes, the arena opens. */
  async function met(stock: Stock, url = `?openworld=${seed}&nodes=40`, options: Parameters<typeof boot>[1] = {}, booted: () => Promise<void> = async () => {}): Promise<Game> {
    const game = await boot(url, options);
    await booted(); // the page's own copy of the bridge is loaded: a spy set here sees what it calls
    game.openModes();
    byId('openworld').click();
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hooks().__openworldFixture({ hero: beside, troop: [], ...stock });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    return game;
  }
  /** The army saved with the world of the seed, as the next entry reads it. */
  const saved = async (): Promise<{ specials: number[]; brought: number[] }> => {
    await settle();
    return ((await indexedDbStore().get(`openworld:${seed}`)) as { army: { specials: number[]; brought: number[] } }).army;
  };
  /** The fight over: the engine says `status` once a move is played, and its board holds only the special marbles of `kinds`. */
  async function over(game: Game, status: number, kinds: number[]): Promise<void> {
    const { Engine } = await import('edgefall-wasm');
    const real = Engine.prototype.specials;
    vi.spyOn(Engine.prototype, 'status').mockImplementation(() => (game.hook<number>('__plies') > 0 ? status : 0));
    vi.spyOn(Engine.prototype, 'specials').mockImplementation(function (this: InstanceType<typeof Engine>) {
      const flat = Array.from(real.call(this));
      return Int32Array.from(Array.from({ length: flat.length / 3 }, (_, i) => flat.slice(3 * i, 3 * i + 3)).filter((rec) => kinds.includes(rec[2]!)).flat());
    });
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
    const [q, r] = move.cells[0]!;
    game.click(q, r);
    game.click(q + DIRS[move.dir]![0], r + DIRS[move.dir]![1]);
  }

  /** The human plays a move and the bot answers it, as in a game of the bot (the answer comes from the worker of the page, in the process). */
  async function exchange(game: Game): Promise<void> {
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
    const [q, r] = move.cells[0]!;
    game.click(q, r);
    game.click(q + DIRS[move.dir]![0], r + DIRS[move.dir]![1]);
    await game.settle();
    game.frame(1000); // the bot's move waits for the slide of the human's
  }

  it('places the brought marbles on the side of the army, one on each, and the bot searches the same board', async () => {
    let withArmy: ReturnType<typeof vi.spyOn>;
    const game = await met({ army: army([1, 1, 9], [1, 9]) }, undefined, {}, async () => void (withArmy = vi.spyOn((await import('edgefall-wasm')).Engine, 'with_army')));
    expect(specials()).toEqual([1, 9]);
    expect(withArmy.mock.calls).toEqual([[14, 14]]); // the page's engine: the standard board, the rogue-lite flag
    expect(game.hook<number>('__plies')).toBe(0);
    await exchange(game);
    expect(game.hook<number>('__plies')).toBe(2); // the bot answered
    expect(withArmy.mock.calls).toEqual([[14, 14], [14, 14]]); // on an engine of the same army, in its worker
  });

  it('places nothing when the army brings nothing: the fight is the plain one, and so is the bot\'s engine', async () => {
    let withArmy: ReturnType<typeof vi.spyOn>;
    const game = await met({ army: army([1, 9], []) }, undefined, {}, async () => void (withArmy = vi.spyOn((await import('edgefall-wasm')).Engine, 'with_army')));
    expect(specials()).toEqual([]);
    await exchange(game);
    expect(game.hook<number>('__plies')).toBe(2);
    expect(withArmy).not.toHaveBeenCalled();
  });

  it('a special marble thrown off in a lost fight is gone from the army, the others stay, and it is told once', async () => {
    const game = await met({ army: army([1, 1, 9], [1, 9]) });
    await over(game, 2, [9]); // the Heavy is thrown off, the Bomb stays
    expect(game.hud()).toContain('Lost: Heavy.');
    byId('boss-goal').click(); // the HUD is drawn again: the loss counts once
    await settle();
    expect(await saved()).toMatchObject({ specials: [1, 9], brought: [9] });
    expect(game.hud()).toContain('Lost: Heavy.');
  });

  it('a won fight keeps the marbles that stayed, and tells nothing lost', async () => {
    const game = await met({ army: army([1, 9], [1, 9]) });
    await over(game, 1, [1, 9]);
    expect(game.hud()).toContain('The marble is gone from the world.');
    expect(game.hud()).not.toContain('Lost');
    expect(await saved()).toMatchObject({ specials: [1, 9], brought: [1, 9] });
  });

  it('a won fight loses the ones thrown off too: a spent Bomb is gone', async () => {
    const game = await met({ army: army([1, 9], [1, 9]) });
    await over(game, 1, [1]);
    expect(game.hud()).toContain('The marble is gone from the world. Lost: Bomb.');
    expect(await saved()).toMatchObject({ specials: [1], brought: [1] });
  });

  it('a fight with none brought loses nothing', async () => {
    const game = await met({ army: army([1, 9], []) });
    await over(game, 2, []);
    expect(game.hud()).not.toContain('Lost');
    expect(await saved()).toMatchObject({ specials: [1, 9], brought: [] });
  });

  it('Flee keeps every marble', async () => {
    const game = await met({ army: army([1, 9], [1, 9]) });
    byId('wild-flee').click();
    await settle();
    expect(data().openworld).toBe(String(seed));
    expect(game.hud()).not.toContain('Lost');
    expect(await saved()).toMatchObject({ specials: [1, 9], brought: [1, 9] });
  });

  it('a world whose save is gone loses nothing and writes nothing', async () => {
    const game = await met({ army: army([1], [1]) });
    await indexedDbStore().delete(`openworld:${seed}`);
    await over(game, 2, []);
    await settle();
    expect(await indexedDbStore().get(`openworld:${seed}`)).toBeUndefined();
  });
});

describe('no other fight has a special marble (#1655)', () => {
  const brought = { army: army([1, 9], [1, 9]), resources: rich };

  it.each(['arena', 'boss'] as const)('the %s entered after the world, with the army brought, has none', async (mode) => {
    const game = await boot(`?openworld=${seed}`);
    game.openModes();
    byId('openworld').click();
    await settle();
    hooks().__openworldFixture({ hero: [0, 0], troop: [], enemies: [], ...brought });
    byId('exit').click(); // the Hub of the menu: the world is left, its army with it
    await settle();
    await game.hook<Promise<void>>('__enterMode', mode);
    await settle();
    expect(data().specials ?? '').toBe('');
  });

  it('a plain game of the bot, the Hub of the menu and a run start with no special marble from the world', async () => {
    const game = await boot('?bot=off');
    expect(data().specials ?? '').toBe('');
    void game;
  });
});

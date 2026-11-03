// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// The boss lairs of the Open world (#1170): the hero walks onto a lair and the normal boss fight starts; a win records the medal
// and the lair in the world's save; Back returns to the Open world with the hero on the lair's entrance.

type Move = { cells: Axial[]; dir: number };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const data = () => document.body.dataset;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
};
const hooks = () => window as unknown as { __openworldFixture: (f: { hero: Axial; troop: Axial[]; enemies: Axial[] }) => void };

/** Enters the world of seed 7 and walks onto lair `lair` from the cell west of it (the hook stands the hero there). */
async function walkOnto(game: Game, lair: number): Promise<Axial> {
  game.openModes();
  byId('openworld').click();
  await settle();
  const [q, r] = data().openworldLairs!.split(' ')[lair]!.split(',').map(Number) as unknown as Axial;
  hooks().__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  return [q - 1, r];
}

describe('the boss lairs of the Open world (#1170)', () => {
  it('walking onto a lair leaves the world and starts a boss fight, the lair numbers choosing the boss', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(data().openworldLairs!.split(' ')).toHaveLength((await import('abalone-wasm')).boss_ids().length); // one lair per boss of the roster (#1171)
    expect(data().openworldLairsBeaten).toBe('');
    await walkOnto(game, 0);
    expect(data().openworld).toBeUndefined();
    const first = data().boss;
    expect(first).toBeTruthy();
    expect(byId('boss-retry').hidden).toBe(false);
    expect(byId('ship-back').hidden).toBe(true); // the fight is on
    await settle();
    await walkOnto(game, 1);
    expect(data().boss).not.toBe(first);
  });

  it('a win records the medal and the lair, and Back to the Open world shows it beaten with the hero on the entrance', async () => {
    const game = await boot('?bot=off&openworld=7', { reducedMotion: true });
    const { Encounter } = await import('abalone-wasm');
    const entrance = await walkOnto(game, 0);
    const won = (): number => (game.hook<number>('__plies') > 0 ? 1 : 0);
    vi.spyOn(Encounter.prototype, 'result').mockImplementation(won);
    vi.spyOn(Encounter.prototype, 'status').mockImplementation(won);
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
    const [q, r] = move.cells[0]!;
    game.click(q, r);
    game.click(q + DIRS[move.dir]![0], r + DIRS[move.dir]![1]);
    expect(game.hud()).toContain('Medal earned');
    expect(byId('ship-back').hidden).toBe(false);
    expect(byId('ship-back').textContent).toBe('Back to the Open world');
    await settle();
    byId('ship-back').click();
    await settle();
    expect(data().openworldAt).toBe(entrance.join(','));
    expect(data().openworldLairsBeaten).toBe('0');
    expect(byId('openworld-medals').textContent).toBe(`Medals 1 / ${(await import('abalone-wasm')).boss_ids().length}`); // the HUD reads the shared medal store (#1171)
    expect(JSON.parse(localStorage.getItem('ab-alone.medals')!)).toEqual({ [Object.keys(JSON.parse(localStorage.getItem('ab-alone.medals')!))[0]!]: 1 });
  });

  it('a lost fight sends Back to the Open world with the lair unbeaten, and Retry keeps the fight the lair\'s', async () => {
    const game = await boot('?bot=off&openworld=7', { reducedMotion: true });
    const { Encounter } = await import('abalone-wasm');
    const entrance = await walkOnto(game, 2);
    byId('boss-retry').click();
    expect(byId('ship-back').textContent).toBe('Back to the Open world');
    const lost = (): number => (game.hook<number>('__plies') > 0 ? 2 : 0);
    vi.spyOn(Encounter.prototype, 'status').mockImplementation(lost);
    vi.spyOn(Encounter.prototype, 'result').mockImplementation(lost);
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
    const [q, r] = move.cells[0]!;
    game.click(q, r);
    game.click(q + DIRS[move.dir]![0], r + DIRS[move.dir]![1]);
    expect(byId('ship-back').hidden).toBe(false);
    byId('ship-back').click();
    await settle();
    expect(data().openworldAt).toBe(entrance.join(','));
    expect(data().openworldLairsBeaten).toBe('');
    expect(byId('openworld-medals').textContent).toBe(`Medals 0 / ${(await import('abalone-wasm')).boss_ids().length}`);
  });

  it('a boss picked from the menu is no lair\'s: the back button stays hidden', async () => {
    const game = await boot('?bot=off&openworld=7');
    await walkOnto(game, 0);
    game.openModes();
    byId('boss-fight').click();
    (byId('boss-list').querySelector('button') as HTMLButtonElement).click();
    vi.spyOn((await import('abalone-wasm')).Encounter.prototype, 'status').mockImplementation(() => 2);
    byId('boss-goal').click();
    expect(byId('ship-back').hidden).toBe(true);
  });
});

describe('the day and the night of the Open world (#1496)', () => {
  const setTime = (ms: number): void => (window as unknown as { __openworldTime: (ms: number) => void }).__openworldTime(ms);
  const MIN = 60_000;

  it('the test hook sets the time of day and the page reads the phase', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(data().openworldPhase).toBe('day');
    setTime(6.5 * MIN);
    expect(data().openworldPhase).toBe('dusk');
    setTime(9 * MIN);
    expect(data().openworldPhase).toBe('night');
  });

  it('a lair entered at night starts the fight on the night board, Retry keeps it, and Back returns to the same hour', async () => {
    const game = await boot('?bot=off&openworld=7', { reducedMotion: true });
    game.openModes();
    byId('openworld').click();
    await settle();
    setTime(9 * MIN);
    await walkOnto(game, 0);
    expect(data().openworld).toBeUndefined();
    expect(data().fightBoard).toBe('night');
    byId('boss-retry').click();
    expect(data().fightBoard).toBe('night');
    const { Encounter } = await import('abalone-wasm');
    vi.spyOn(Encounter.prototype, 'status').mockImplementation(() => 2);
    vi.spyOn(Encounter.prototype, 'result').mockImplementation(() => 2);
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
    const [q, r] = move.cells[0]!;
    game.click(q, r);
    game.click(q + DIRS[move.dir]![0], r + DIRS[move.dir]![1]);
    byId('ship-back').click();
    await settle();
    expect(data().fightBoard).toBeUndefined(); // the world is back, the board is nobody's
    expect(data().openworldPhase).toBe('night');
  });

  it('a lair entered at dusk and at day takes their boards; a boss picked from the menu keeps the ordinary board', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    await walkOnto(game, 0);
    expect(data().fightBoard).toBe('day');
    game.openModes();
    byId('openworld').click();
    await settle();
    setTime(6.5 * MIN);
    await walkOnto(game, 1);
    expect(data().fightBoard).toBe('dusk');
    game.openModes();
    byId('boss-fight').click();
    (byId('boss-list').querySelector('button') as HTMLButtonElement).click();
    expect(data().fightBoard).toBeUndefined();
  });
});

describe("Tally's line in the Open world (#1171)", () => {
  it('shows "Claim 0412: unworked." the first time the player opens an Open world, and never again', async () => {
    const game = await boot('?bot=off&openworld=7'); // the link opens the world at the load (#1361)
    await settle();
    expect(byId('openworld-tally').textContent).toBe('Claim 0412: unworked.');
    expect(localStorage.getItem('ab-alone.tally0412')).toBe('seen');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(byId('openworld-tally').textContent).toBe('');
  });
});

describe("Tally's ending and ledger lines (#1175, #1315)", () => {
  const fixture = (beaten: number[]): void =>
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [], enemies: [], beaten });

  it("shows Tally's ending line once every lair is beaten, and nothing while one is left, #1175", async () => {
    localStorage.setItem('ab-alone.tally0412', 'seen'); // the claim line is spent
    await boot('?bot=off&openworld=7');
    await settle();
    expect(data().openworldAt).toBe('0,0');
    const count = data().openworldLairs!.split(' ').length;
    fixture(Array.from({ length: count - 1 }, (_, i) => i)); // all lairs but one
    expect(byId('openworld-tally').textContent).toBe('');
    fixture(Array.from({ length: count }, (_, i) => i));
    expect(byId('openworld-tally').textContent).toBe('Variance noted. Clamp: open. Crew attached: 6.');
  });

  it('the ledger line counts the seats on file after the world is left and opened again, #1315', async () => {
    const game = await boot('?bot=off&openworld=7');
    await settle();
    const count = data().openworldLairs!.split(' ').length;
    fixture([0, 1, 2]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); // leaving the world saves it
    await settle();
    expect(data().openworldSaved).toBe('1');
    game.openModes();
    byId('openworld').click();
    await settle();
    expect(data().openworld).toBe('7');
    expect(byId('openworld-tally').textContent).toBe(`Seats on file: 3 of ${count}. Slag-glass remembers heat.`);
  });
});

describe('the Dungeon button of the HUD (#1291)', () => {
  it('walks the hero toward the nearest tower through the wasm bridge', async () => {
    const game = await boot('?bot=off&openworld=7');
    game.openModes();
    byId('openworld').click();
    await settle();
    const [q, r] = data().openworldLairs!.split(' ')[0]!.split(',').map(Number) as unknown as Axial;
    hooks().__openworldFixture({ hero: [q - 3, r], troop: [], enemies: [] });
    byId('openworld-dungeon').click();
    expect(byId('openworld-dungeon-note').textContent).toBe('');
    expect(data().openworldAt).not.toBe(`${q - 3},${r}`); // the first cell of the walk is taken at once
  });
});

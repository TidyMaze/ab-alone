// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { LEGACY_UNLOCKED } from './collector';
import { newRun, type Run } from './roguelite';
import { boot, type Game } from './test/harness';

// The cues of world.md section 7 (#1570), through the jsdom harness: nobody can listen here, so the page reports each cue
// it played (`__cues`, like `__tellCues` for the tells) and these tests read that list. No cue before the first gesture,
// none with the effects slider at 0.
type Move = { cells: Axial[]; dir: number };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const gesture = (): boolean => dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
const cues = (game: Game): string[] => game.hook<string[]>('__cues');
const count = (game: Game, event: string): number => cues(game).filter((c) => c === event).length;
const plainRun = (seed: number, best: number): Run => ({ ...newRun(seed, best, LEGACY_UNLOCKED), enemies: false });

/** Starts the fight of the boss named `name` from the boss list. */
function start(game: Game, name: string): void {
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent!.includes(name))!.click();
}
/** The engine's answers once a ply was played, with `over` as its status: 0 running, 1 Black wins, 2 White wins, 3 draw. */
async function judge(game: Game, kind: 'Encounter' | 'Engine', over: { status: number }): Promise<void> {
  const wasm = await import('abalone-wasm');
  const status = (): number => (game.hook<number>('__plies') > 0 ? over.status : 0);
  if (kind === 'Encounter') vi.spyOn(wasm.Encounter.prototype, 'result').mockImplementation(status);
  vi.spyOn(wasm[kind].prototype, 'status').mockImplementation(status);
}
/** Plays the first legal one-marble move forward, by two clicks. */
function move(game: Game): void {
  const mv = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
  const [q, r] = mv.cells[0]!;
  game.click(q, r);
  game.click(q + DIRS[mv.dir]![0], r + DIRS[mv.dir]![1]);
}

describe('the UI click (#1570)', () => {
  it('sounds on a button once the sound is on, never before a gesture', async () => {
    const game = await boot('?bot=off', { audio: true });
    game.openModes();
    expect(cues(game)).toEqual([]);
    gesture();
    game.openModes();
    expect(cues(game)).toEqual(['click']);
  });

  it('is silent with the effects slider at 0', async () => {
    const game = await boot('?bot=off', { audio: true, storage: { 'ab-alone.volume.effects': '0' } });
    gesture();
    game.openModes();
    expect(cues(game)).toEqual([]);
  });

  it('does not sound on the board, a slider or the text of the page', async () => {
    const game = await boot('?bot=off', { audio: true });
    gesture();
    for (const target of [document.querySelector('canvas')!, byId('hud'), document.body]) target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    game.openSettings();
    byId('volume-music').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cues(game)).toEqual(['click']); // the settings button alone
  });

  it('does not sound on the pick of a node of the rogue-lite map, nor on Start: they have their own pick', async () => {
    const game = await boot('?nodes=50&bot=off', { audio: true });
    gesture();
    game.openModes();
    byId('roguelite').click();
    expect(cues(game)).toEqual(['click', 'click']); // the mode menu button and the mode
    byId('run-map').querySelector<HTMLButtonElement>('button[data-node]:not(:disabled)')!.click();
    expect(document.body.dataset.pick).toBe('pick');
    expect(cues(game)).toEqual(['click', 'click']);
  });
});

describe('the win and the loss (#1570)', () => {
  it('a boss fight won sounds once, not again when the plate is drawn again', async () => {
    const game = await boot('?bot=off', { reducedMotion: true, audio: true });
    gesture();
    const over = { status: 0 };
    await judge(game, 'Encounter', over);
    start(game, 'The Echo');
    over.status = 1;
    move(game);
    expect(count(game, 'win')).toBe(1);
    game.openSettings();
    byId('setting-flat-hud').click();
    expect(game.hud()).toContain('Victory');
    expect([count(game, 'win'), count(game, 'loss')]).toEqual([1, 0]);
  });

  it('a boss fight lost, a draw of it too, sounds the loss', async () => {
    const game = await boot('?bot=off', { reducedMotion: true, audio: true });
    gesture();
    const over = { status: 0 };
    await judge(game, 'Encounter', over);
    start(game, 'The Echo');
    over.status = 2;
    move(game);
    expect([count(game, 'win'), count(game, 'loss')]).toEqual([0, 1]);
  });

  it('a game against the bot won sounds, a draw does not', async () => {
    for (const [status, expected] of [[1, 1], [3, 0]] as const) {
      const game = await boot('?nodes=50', { audio: true });
      gesture();
      await judge(game, 'Engine', { status });
      move(game);
      expect(count(game, 'win'), `status ${status}`).toBe(expected);
    }
  });

  it('a hot seat is silent: nobody there wins or loses', async () => {
    const game = await boot('?bot=off', { audio: true });
    gesture();
    await judge(game, 'Engine', { status: 1 });
    move(game);
    expect(document.body.dataset.over).toBe('win');
    expect([count(game, 'win'), count(game, 'loss')]).toEqual([0, 0]);
  });

  it('is silent before a gesture, and with the effects slider at 0', async () => {
    for (const [storage, key] of [[{}, true], [{ 'ab-alone.volume.effects': '0' }, false]] as const) {
      const game = await boot('?bot=off', { reducedMotion: true, audio: true, storage });
      if (!key) gesture();
      await judge(game, 'Encounter', { status: 1 });
      start(game, 'The Echo');
      move(game);
      expect(cues(game).filter((c) => c !== 'click')).toEqual([]);
    }
  });

  it('is held back while the Replay shows the end, and sounds once the live game is back', async () => {
    const game = await boot('?bot=off', { reducedMotion: true, audio: true });
    gesture();
    const over = { status: 0 };
    await judge(game, 'Encounter', over);
    start(game, 'The Echo');
    move(game);
    byId('replay').click();
    over.status = 1; // the end comes while the Replay is open, as when a peer's move lands
    byId('replay-prev').click();
    byId('replay-next').click();
    expect(count(game, 'win')).toBe(0);
    byId('replay-live').click();
    expect(count(game, 'win')).toBe(1);
  });
});

describe('the boss phase change (#1570)', () => {
  it('sounds once when the phase moves, not on the first sight of the fight nor on a redraw', async () => {
    const game = await boot('?bot=off', { reducedMotion: true, audio: true });
    gesture();
    const wasm = await import('abalone-wasm');
    let phase = 0;
    vi.spyOn(wasm.Encounter.prototype, 'phase').mockImplementation(() => phase);
    start(game, 'The Echo');
    expect(count(game, 'phase')).toBe(0);
    phase = 1;
    move(game);
    expect(count(game, 'phase')).toBe(1);
    game.openSettings();
    byId('setting-flat-hud').click();
    expect(count(game, 'phase')).toBe(1);
  });

  it('does not sound while the Replay is open', async () => {
    const game = await boot('?bot=off', { reducedMotion: true, audio: true });
    gesture();
    const wasm = await import('abalone-wasm');
    let phase = 0;
    vi.spyOn(wasm.Encounter.prototype, 'phase').mockImplementation(() => phase);
    start(game, 'The Echo');
    move(game);
    byId('replay').click();
    phase = 1;
    byId('replay-prev').click();
    byId('replay-next').click();
    expect(count(game, 'phase')).toBe(0);
  });
});

describe('the rogue-lite reward (#1570)', () => {
  it('sounds when the reward of a won fight comes up, not while it stays, and again for the next', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?bot=off', { audio: true, indexedDB });
    gesture();
    const won = { ...plainRun(1, 3), army: 12, path: [0], reward: true };
    await game.hook('__run', won);
    expect(document.body.dataset.run).toBe('reward');
    expect(count(game, 'reward')).toBe(1);
    byId('run-map').querySelector<HTMLButtonElement>('button[data-offer]')!.click();
    expect(document.body.dataset.run).toBe('map');
    expect(count(game, 'reward')).toBe(1);
    await game.hook('__run', won);
    expect(count(game, 'reward')).toBe(2);
  });
});

// The player walks its columns to the centre while the bots hold: every other set is void at the end of round 25
// (the same file as main.royale.test.ts), and the player wins.
const NW = (...cells: Axial[]): number[] => [0, cells.length, 4, ...[...cells, [0, 0], [0, 0]].slice(0, 3).flat()];
const column = (cells: Axial[], steps: number): number[][] => Array.from({ length: steps }, (_, s) => NW(...cells.map(([q, r]): Axial => [q, r - s])));
const END = {
  seed: 7,
  rounds: [
    ...column([[-4, 8], [-4, 7], [-4, 6]], 3),
    ...column([[-3, 8], [-3, 7], [-3, 6]], 3),
    ...column([[-5, 8], [-5, 7]], 3),
    ...column([[-2, 7], [-2, 6]], 2),
    ...Array.from({ length: 14 }, () => []),
  ],
};

describe('the royale (#1570)', () => {
  const holdAll = (game: Game, rounds: number): void => {
    for (let round = 0; round < rounds && !byId('royale-hold').disabled; round++) {
      byId('royale-hold').click();
      game.frame(10_000);
    }
  };
  async function royale(options: { reducedMotion?: boolean } = {}): Promise<Game> {
    const game = await boot('?bot=off', { audio: true, ...options });
    gesture();
    game.hook('__royale', { seed: 7, rounds: [] }); // a fixed seed: the same bots every time
    return game;
  }

  const heard = (game: Game): string[] => cues(game).filter((c) => c !== 'click');

  it('sounds an elimination when a marble set goes out, once for sets that go out together, and the loss at the end', async () => {
    const game = await royale();
    holdAll(game, 80);
    expect(byId('hud').querySelector('.turn')!.textContent).toBe('You place 6th');
    expect(heard(game)).toEqual(['elimination', 'elimination', 'loss']);
  });

  it('plays the same cues under reduced motion, where the arena jumps to each round', async () => {
    const game = await royale({ reducedMotion: true });
    holdAll(game, 80);
    expect(heard(game)).toEqual(['elimination', 'elimination', 'loss']);
  });

  it('a game file that opens already over sounds its win once, and no elimination for the sets already out', async () => {
    const game = await boot('?bot=off', { audio: true });
    gesture();
    game.hook('__royale', END);
    expect(cues(game)).toEqual(['win']);
    game.hook('__royale', END);
    expect(cues(game)).toEqual(['win', 'win']); // a new game of its own
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot, type Game } from './test/harness';
import { WAVE_1_WIN } from './test/trainerline';

// Trainer mode on the harness (#1159): Trainer in the mode menu starts wave 1, a bot with one marble against the
// player's 14. A wave won shows its card with Next wave, a wave lost or drawn ends or repeats it, Retry starts over.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const card = (): string => (byId('trainer-card').hidden ? '' : byId('trainer-text').textContent!);
const whites = (game: Game): number => game.hook<number[]>('__board').filter((c) => c === 2).length;
async function start(url = '?bot=off'): Promise<Game> {
  const game = await boot(url);
  game.openModes();
  byId('trainer').click();
  return game;
}
/** A game on `Engine.trainer(wave)` played out till it ends as `want`: Black moves at random, White as the bot or at random. */
async function playOut(wave: number, want: number, white: 'bot' | 'random'): Promise<number[][]> {
  const { Engine } = await import('abalone-wasm');
  for (let seed = 1; seed < 200; seed++) {
    let s = seed;
    const rnd = (): number => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const engine = Engine.trainer(wave);
    const moves: number[][] = [];
    while (engine.status() === 0 && moves.length < 300) {
      const all = Array.from(engine.legal_moves());
      const k = Math.floor(rnd() * (all.length / 8));
      const mv = white === 'bot' && engine.to_move() === 2 ? Array.from(engine.best_move(60)) : all.slice(k * 8, k * 8 + 8);
      engine.play(Int32Array.from(mv));
      moves.push(mv);
    }
    if (engine.status() === want) return moves;
  }
  throw new Error('no such game');
}

describe('main.ts, Trainer mode (#1159)', () => {
  it('Trainer in the mode menu starts wave 1: one bot marble against 14, the wave and the best in the HUD', async () => {
    const game = await start();
    expect(byId('mode-menu').hidden).toBe(true);
    expect(document.body.dataset.trainer).toBe('1');
    expect(game.hud()).toContain('Trainer · wave 1 · best 0');
    expect(whites(game)).toBe(1);
    expect(game.hook<number[]>('__board').filter((c) => c === 1)).toHaveLength(14);
    expect(byId('new-game').hidden).toBe(true);
    expect(byId('boss-retry').hidden).toBe(false);
    expect(byId('hint').hidden).toBe(true);
    expect(byId<HTMLButtonElement>('auto-play').disabled).toBe(true);
    expect(card()).toBe('');
  });

  it('the test hook loads a wave directly', async () => {
    const game = await start();
    game.hook('__trainer', 5);
    expect(document.body.dataset.trainer).toBe('5');
    expect(whites(game)).toBe(5);
    expect(game.hud()).toContain('Trainer · wave 5 · best 0');
  });

  it('a wave won shows its card, records the best, and Next wave brings one more marble', async () => {
    const game = await start();
    game.hook('__playMoves', WAVE_1_WIN);
    expect(whites(game)).toBe(0);
    expect(card()).toBe('Wave 1 clearedWaves survived: 1Best: 1');
    expect(game.hud()).toContain('Trainer · wave 1 · best 1');
    expect(byId('trainer-next').textContent).toBe('Next wave');
    byId('trainer-next').click();
    expect(card()).toBe('');
    expect(document.body.dataset.trainer).toBe('2');
    expect(game.hud()).toContain('Trainer · wave 2 · best 1');
    expect(whites(game)).toBe(2);
    expect(game.hook('__plies')).toBe(0);
    expect(localStorage.getItem('ab-alone.trainer-best')).toBe('1'); // kept for the next visit
  });

  it('a wave lost ends the run: the wave before is the score, and Retry starts again at wave 1', async () => {
    const game = await start();
    game.hook('__trainer', 14);
    game.hook('__playMoves', await playOut(14, 2, 'bot'));
    expect(card()).toBe('Fell on wave 14Waves survived: 13Best: 13');
    expect(byId('trainer-next').hidden).toBe(true);
    byId('boss-retry').click();
    expect(card()).toBe('');
    expect(game.hud()).toContain('Trainer · wave 1 · best 13');
    expect(whites(game)).toBe(1);
  });

  it('a wave nobody can win is won by the player: a draw by idle plies or repetition counts for him', async () => {
    const game = await start();
    game.hook('__trainer', 14);
    game.hook('__playMoves', await playOut(14, 1, 'random'));
    expect(card()).toBe('Wave 14 clearedWaves survived: 14Best: 14');
    expect(byId('trainer-next').hidden).toBe(false);
  });

  it('another mode leaves the Trainer', async () => {
    const game = await start();
    game.hook('__playMoves', WAVE_1_WIN);
    game.openModes();
    byId('boss-fight').click();
    byId('boss-list').querySelector('button')!.click();
    expect(document.body.dataset.trainer).toBeUndefined();
    expect(card()).toBe('');
    expect(game.hud()).not.toContain('Trainer');
  });

  it('the bot answers on the wave board, and a wave past a full army keeps 14 marbles', async () => {
    const game = await start('?nodes=50');
    game.hook('__trainer', 20);
    expect(whites(game)).toBe(14);
    expect(game.hud()).toContain('Trainer · wave 20');
    const move = game.hook<{ cells: [number, number][]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...move.cells[0]!);
    game.click(...game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
    await game.settle();
    game.frame(1000);
    await game.settle();
    expect(game.hook('__plies')).toBe(2);
  });

  it('the replay rebuilds the wave, not a standard game', async () => {
    const game = await start();
    game.hook('__trainer', 3);
    game.hook('__playMoves', WAVE_1_WIN.slice(0, 1));
    byId('replay').click();
    byId('replay-prev').click();
    expect(whites(game)).toBe(3);
  });
});

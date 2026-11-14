// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot, type Game } from './test/harness';
import { IDBFactory } from 'fake-indexeddb';
import { indexedDbStore } from './idb';
import { WALLED_IN } from './test/blockedline';

// Undo takes back the player's move and the bot's reply, in a casual bot game only (#1672).
type Move = { cells: [number, number][]; dir: number };
const undo = (): HTMLButtonElement => document.getElementById('undo') as HTMLButtonElement;

async function playPair(game: Game): Promise<void> {
  const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
  game.click(...move.cells[0]!);
  game.click(...game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
  expect(undo().hidden).toBe(true); // the bot thinks
  await game.settle();
  game.frame(1000);
}

describe('main.ts, Undo (#1672)', () => {
  it('is absent at the start, there after the reply, and takes both moves back', async () => {
    const game = await boot('?nodes=50', { storage: { 'ab-alone.difficulty': 'normal' } });
    await game.settle();
    expect(undo().hidden).toBe(true);
    const mine = game.turn();
    await playPair(game);
    expect(game.hook('__plies')).toBe(2);
    expect(undo().hidden).toBe(false);
    undo().click();
    expect(game.hook('__plies')).toBe(0);
    expect(game.turn()).toBe(mine);
    expect(undo().hidden).toBe(true);
    undo().click(); // nothing to take back: a press on the hidden button does nothing
    expect(game.hook('__plies')).toBe(0);
  });

  it('does nothing when pressed while the bot thinks', async () => {
    const game = await boot('?nodes=50', { storage: { 'ab-alone.difficulty': 'normal' } });
    await game.settle();
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...move.cells[0]!);
    game.click(...game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
    expect(game.hook('__plies')).toBe(1);
    undo().click(); // hidden, and the rules say no: the move stays
    expect(game.hook('__plies')).toBe(1);
    await game.settle();
    game.frame(1000);
    expect(game.hook('__plies')).toBe(2);
  });

  it('is saved with the game: after a reload the mark is still there, and a new game clears it (#1672)', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?nodes=50', { indexedDB, storage: { 'ab-alone.difficulty': 'normal' } });
    await game.settle();
    await playPair(game);
    undo().click();
    await game.settle();
    const store = indexedDbStore();
    expect(await store.get('local')).toMatchObject({ undone: true });
    const again = await boot('?nodes=50', { indexedDB, storage: { 'ab-alone.difficulty': 'normal' } });
    await again.settle();
    await playPair(again);
    await again.settle();
    expect(await indexedDbStore().get('local')).toMatchObject({ undone: true }); // restored, then written again with the next move
    const fresh = document.getElementById('new-game')!;
    fresh.click();
    fresh.click();
    await playPair(again);
    await again.settle();
    expect(await indexedDbStore().get('local')).not.toHaveProperty('undone');
  });

  it('is absent in the trainer', async () => {
    const game = await boot('?nodes=50', { storage: { 'ab-alone.difficulty': 'normal' } });
    game.hook('__trainer', 1);
    game.hook('__playMoves', WALLED_IN);
    await game.settle();
    expect(undo().hidden).toBe(true);
  });
});

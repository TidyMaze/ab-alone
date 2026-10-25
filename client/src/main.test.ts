// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { boot } from './test/harness';

// The whole page on the harness (src/test/harness.ts): the smoke test of decision #445. The tests of each part of
// main.ts follow in their own files.
describe('main.ts', () => {
  it('starts a local game, plays a move by two clicks, and hands the turn to the other side', async () => {
    const game = await boot('?bot=off');
    expect(game.turn()).toBe('Black to move');
    const legal = game.hook<{ cells: Axial[]; dir: number }[]>('__legal');
    const mv = legal.find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    expect(game.hook('__rings')).toEqual([mv.cells[0]]);
    const target = game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!;
    game.click(...target.cell);
    expect(game.hook('__plies')).toBe(1);
    expect(game.turn()).toBe('White to move');
    game.frame();
    expect(game.draws()).toBe(1);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';
import { WALLED_IN } from './test/blockedline';

// The HUD says what the bot's last move did (#1680).

describe('main.ts, the bot move note (#1680)', () => {
  it('the HUD names the bot move after its reply', async () => {
    const game = await boot();
    game.hook('__trainer', 1);
    game.hook('__playMoves', WALLED_IN);
    await game.settle();
    game.frame(1000);
    game.click(4, -1);
    game.click(4, -2);
    for (let i = 0; i < 20 && game.hook<number>('__plies') < WALLED_IN.length + 2; i++) {
      game.frame(1000);
      await game.settle();
    }
    expect(game.hud()).not.toContain(' · Bot moved');
    expect(game.hud()).toMatch(/Bot moved \d marbles? (right|left|up-right|down-left|up-left|down-right)/);
  });

  it('clears once the player moves, and a new game at the same ply shows none', async () => {
    const game = await boot();
    game.hook('__trainer', 1);
    game.hook('__playMoves', WALLED_IN);
    await game.settle();
    game.frame(1000);
    game.click(4, -1);
    game.click(4, -2);
    for (let i = 0; i < 20 && game.hook<number>('__plies') < WALLED_IN.length + 2; i++) {
      game.frame(1000);
      await game.settle();
    }
    expect(game.hud()).toContain('Bot moved');
    game.frame(1000);
    const mv = game.hook<{ cells: [number, number][]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    game.click(...game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!.cell); // the player moves: the note is gone until the bot answers
    expect(game.hud()).not.toContain('Bot moved');
    const fresh = document.getElementById('new-game')!;
    fresh.click();
    fresh.click();
    expect(game.hook<number>('__plies')).toBe(0);
    expect(game.hud()).not.toContain('Bot moved');
  });
});

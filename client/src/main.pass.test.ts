// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';
import { WALLED_IN } from './test/blockedline';

// A side with marbles but no legal move passes its turn (#1301, rules.md section 7): the engine passes it, the HUD
// says so, the move log records it, and the bot is asked only when it can move again.

describe('main.ts, a blocked side passes (#1301)', () => {
  it('the bot walled in passes: the HUD says so, the log records it, the player moves and the bot answers', async () => {
    const info = vi.spyOn(console, 'info');
    const game = await boot();
    game.hook('__trainer', 1);
    const turn = game.turn(); // the player's side, named by the glass it wears
    const bot = turn.startsWith('Black') ? 'White' : 'Black';
    game.hook('__playMoves', WALLED_IN);
    await game.settle();
    expect(game.hud()).toContain(`${bot} has no move: turn passed`);
    expect(game.turn()).toBe(turn);
    expect(game.hook<number>('__plies')).toBe(WALLED_IN.length);
    expect(info).toHaveBeenCalledWith('[ab-alone] pass', expect.objectContaining({ data: { side: 2, ply: WALLED_IN.length } }));
    // (4,-1) steps back to (4,-2): the bot's marble can move again, and the bot answers.
    game.frame(1000); // the last ply's slide ends
    game.click(4, -1);
    game.click(4, -2);
    for (let i = 0; i < 20 && game.hook<number>('__plies') < WALLED_IN.length + 2; i++) {
      game.frame(1000); // the player's slide ends, then the bot's reply is played
      await game.settle();
    }
    expect(game.hook<number>('__plies')).toBe(WALLED_IN.length + 2);
    expect(game.hud()).not.toContain('has no move');
    info.mockRestore();
  });
});

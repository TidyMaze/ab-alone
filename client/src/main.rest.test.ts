// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';

// What the other main.*.test.ts files leave out of main.ts: a browser check asking for the next draw (#435).

describe('main.ts, __drawNext', () => {
  it('under automation, a draw asked for after a slow one waits 100 ms, not 4 times its cost', async () => {
    const game = await boot('?bot=off');
    const now = vi.mocked(performance.now);
    const clock = now.getMockImplementation()!;
    now.mockImplementation(() => clock() + 200); // the first draw takes 200 ms (the shaders compile)
    game.frame();
    now.mockImplementation(clock);
    expect(game.draws()).toBe(1);
    game.frame(100);
    expect(game.draws()).toBe(1); // a slow draw holds the next for 4 times its cost
    expect(game.hook('__drawNext')).toBe(1); // the draws so far
    game.frame(16); // 116 ms after the slow draw
    expect(game.draws()).toBe(2);
    expect(game.hook('__draws')).toBe(2);
    game.frame(16); // asked once only: back to every 100 ms
    expect(game.draws()).toBe(2);
  });
});

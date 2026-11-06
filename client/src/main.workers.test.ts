// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';

// Lazy workers (#1579): each bot worker loads its own copy of the 672 KB engine, so the page starts one only when it has
// something to ask: the analysis worker when the evaluation bar asks for a score, the bot worker when the bot is asked a move.
describe('bot workers', () => {
  it('starts none on the Hub, where no bar and no bot are on', async () => {
    let workers = 0;
    const game = await boot('/', { onWorker: () => void workers++ });
    expect(document.body.dataset.hub).toBeDefined();
    expect(workers).toBe(0);
    await game.settle();
  });

  it('starts only the analysis worker at the hot-seat board, where the bar shows and no bot plays', async () => {
    let workers = 0;
    const game = await boot('?bot=off', { onWorker: () => void workers++ });
    await game.settle();
    expect(workers).toBe(1);
  });

  it('starts the bot worker with the first bot reply, after the analysis worker', async () => {
    let workers = 0;
    const game = await boot('?nodes=50', { onWorker: () => void workers++ });
    await game.settle();
    expect(workers).toBe(1); // the bar asked for the start position, the bot has not been asked
    await game.hook<Promise<number>>('__playTurns', 1, [4]);
    expect(workers).toBe(2);
    expect(game.hook<number>('__plies')).toBe(2); // the reply came
  });
});

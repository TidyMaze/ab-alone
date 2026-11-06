// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { boot } from './test/harness';

// The exit of a screen (#1562, docs/specs/motion.md story 11): the Hub opening over the table plays the dim over the new screen,
// which is live at once; reduced motion cuts it.
vi.setConfig({ testTimeout: 8000 });
const layer = () => document.getElementById('screen-exit');

describe('main.ts, the exit of a screen (#1562)', () => {
  it('plays a dim when the Hub opens over the table, and the Hub is live at once', async () => {
    const game = await boot('?bot=off');
    game.frame();
    expect(layer()).toBeNull();
    document.getElementById('ship')!.click();
    await game.settle();
    game.frame();
    expect(layer()!.dataset.flip).toMatch(/^[ab]$/);
    expect(document.body.dataset.hub).toBeDefined();
  });

  it('plays nothing under reduced motion', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    game.frame();
    document.getElementById('ship')!.click();
    await game.settle();
    game.frame();
    expect(layer()).toBeNull();
  });
});

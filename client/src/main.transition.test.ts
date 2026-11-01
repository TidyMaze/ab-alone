// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';

// Screen cross-fades (#1099, docs/specs/motion.md story 9) on the harness: the hub, a boss fight and the Open world fade
// the canvas in on the base token; reduced motion cuts.

const animate = vi.fn();
Element.prototype.animate = animate as unknown as Element['animate'];
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
afterEach(() => animate.mockClear());

describe('main.ts screen transitions', () => {
  it('fades the hub in when the game opens on the ship', async () => {
    await boot('');
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 200 }));
  });

  it('fades a boss fight in without holding the input', async () => {
    const game = await boot('?bot=off');
    animate.mockClear();
    game.openModes();
    byId('boss-fight').click();
    byId('boss-list').querySelector('button')!.click();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.boss).toBeDefined(); // the fight is live at once
  });

  it('fades the Open world in once it is open', async () => {
    const game = await boot('?bot=off&openworld=7');
    animate.mockClear();
    game.openModes();
    byId('openworld').click();
    await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
  });

  it('cuts under reduced motion', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    game.openModes();
    byId('boss-fight').click();
    byId('boss-list').querySelector('button')!.click();
    expect(animate).not.toHaveBeenCalled();
  });
});

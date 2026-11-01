// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';

// The left HUD panel folds (#957): a button on the panel folds it to a small tab with the button alone, and unfolds it
// again; the choice is saved like the other settings. Folded, the panel stays in the page for screen readers: the turn
// and the score are still announced, and one press shows them again.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const fold = (): HTMLButtonElement => byId('hud-fold') as HTMLButtonElement;

describe('main.ts the HUD panel folds (#957)', () => {
  it('a button folds the panel to a tab and unfolds it, named, with aria-expanded, and saves the choice', async () => {
    const game = await boot('?bot=off');
    expect(fold().disabled).toBe(false);
    expect([fold().getAttribute('aria-label'), fold().getAttribute('aria-controls')]).toEqual(['HUD panel', 'hud']);
    expect([fold().getAttribute('aria-expanded'), fold().title]).toEqual(['true', 'Fold the panel']);
    expect(byId('hud-dock').dataset.folded).toBeUndefined();
    fold().click();
    expect([fold().getAttribute('aria-expanded'), fold().title]).toEqual(['false', 'Unfold the panel']);
    expect(byId('hud-dock').dataset.folded).toBe('');
    expect(localStorage.getItem('ab-alone.hud-folded')).toBe('on');
    expect(game.turn()).not.toBe(''); // still in the page, for a screen reader
    fold().click();
    expect(fold().getAttribute('aria-expanded')).toBe('true');
    expect(byId('hud-dock').dataset.folded).toBeUndefined();
    expect(localStorage.getItem('ab-alone.hud-folded')).toBe('off');
  });

  it('opens folded when the player folded it last time', async () => {
    const booting = boot('?bot=off');
    localStorage.setItem('ab-alone.hud-folded', 'on');
    await booting;
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    expect(byId('hud-dock').dataset.folded).toBe('');
  });
});

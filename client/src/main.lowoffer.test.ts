// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SLOW_RUNS } from './quality';
import { boot, type Game } from './test/harness';

// The low tier offer (#849): a sustained slow frame rate offers the low tier once, as a quiet note with Accept and Dismiss,
// at a quiet moment only. The hook __slowWindow feeds one window of 30 frames (adaptation is skipped under automation).

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const offer = (): HTMLElement => byId('low-offer');
const slow = (game: Game, windows = SLOW_RUNS, ms = 40): void => {
  for (let i = 0; i < windows; i++) game.hook('__slowWindow', ms);
};

describe('the low tier offer (#849)', () => {
  it('stays hidden while the rate is fine, and after fewer slow windows than SLOW_RUNS', async () => {
    const game = await boot('?bot=off');
    game.frame(16);
    expect(offer().hidden).toBe(true);
    slow(game, SLOW_RUNS - 1);
    game.hook('__slowWindow', 16); // a fast window starts the count over
    slow(game, SLOW_RUNS - 1);
    game.frame(16);
    expect(offer().hidden).toBe(true);
  });

  it('shows after a sustained slow rate and changes nothing until a press; Dismiss is remembered', async () => {
    const game = await boot('?bot=off');
    slow(game);
    game.frame(16);
    expect(offer().hidden).toBe(false);
    expect(document.body.dataset.tier).toBe('high');
    byId('low-offer-dismiss').click();
    expect(offer().hidden).toBe(true);
    expect(document.body.dataset.tier).toBe('high');
    expect(localStorage.getItem('ab-alone.low-offer')).toBe('dismissed');
    slow(game);
    game.frame(16);
    expect(offer().hidden).toBe(true); // once per page view, and remembered
  });

  it('does not show again on the next page view once answered', async () => {
    const game = await boot('?bot=off');
    localStorage.setItem('ab-alone.low-offer', 'dismissed');
    slow(game);
    game.frame(16);
    expect(offer().hidden).toBe(true);
  });

  it('Accept switches to the low tier and stores it', async () => {
    const game = await boot('?bot=off&quality=high');
    slow(game);
    game.frame(16);
    byId('low-offer-accept').click();
    expect(offer().hidden).toBe(true);
    expect(document.body.dataset.tier).toBe('low');
    expect(localStorage.getItem('ab-alone.tier')).toBe('low');
    expect(localStorage.getItem('ab-alone.low-offer')).toBe('accepted');
  });

  it('is not offered on the low tier', async () => {
    const game = await boot('?bot=off&quality=low');
    slow(game);
    game.frame(16);
    expect(offer().hidden).toBe(true);
  });

  it('waits for the end of a move animation', async () => {
    const game = await boot('?bot=off');
    const cell = game.hook<{ cells: [number, number][] }[]>('__legal').find((m) => m.cells.length === 1)!.cells[0]!;
    game.click(...cell);
    game.click(...game.hook<{ cell: [number, number] }[]>('__targets')[0]!.cell);
    slow(game);
    game.frame(1); // the slide runs
    expect(offer().hidden).toBe(true);
    game.frame(2000);
    expect(offer().hidden).toBe(false);
  });

  it('works with reduced motion', async () => {
    const game = await boot('?bot=off&quality=high', { reducedMotion: true });
    slow(game);
    game.frame(16);
    expect(offer().hidden).toBe(false);
  });

  it('is not offered in an online game, whose turn has a timer', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    byId('play-online').click();
    for (let i = 0; i < 50 && document.body.dataset.seat !== 'player'; i++) await game.settle();
    expect(document.body.dataset.seat).toBe('player');
    slow(game);
    game.frame(16);
    expect(offer().hidden).toBe(true);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HEAT } from './marbles';
import { boot, type Game } from './test/harness';

// #509: the enemy shell's faint heat pulse on the page (src/test/harness.ts). It glows only on the high tier with safe
// mode and reduced motion off; body[data-pulse] says whether it is on, window.__shellPulse() reads its glow.

/** Boots with the stored settings set after the harness clears the storage, before main.ts reads them. */
async function bootWith(stored: Record<string, string>, options?: Parameters<typeof boot>[1]): Promise<Game> {
  const booting = boot('?bot=off', options);
  for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
  return booting;
}

/** The shell's glow over a few frames 0.7 s apart. */
const glows = (game: Game): number[] =>
  Array.from({ length: 8 }, () => {
    game.frame(700);
    return game.hook<number>('__shellPulse');
  });

const ON = { 'ab-alone.safe-mode': 'off', 'ab-alone.quality': 'high' };

describe('the heat pulse of the shell (#509)', () => {
  it('glows slowly and faintly on the high tier once safe mode is off', async () => {
    const game = await bootWith(ON);
    expect(document.body.dataset.pulse).toBe('on');
    const seen = glows(game);
    expect(new Set(seen).size).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(HEAT.peak);
  });

  it.each([
    ['safe mode, on by default', { 'ab-alone.quality': 'high' }, {}],
    ['the low tier', { ...ON, 'ab-alone.quality': 'low' }, {}],
    ['reduced motion', ON, { reducedMotion: true }],
  ])('is off under %s', async (_, stored, options) => {
    const game = await bootWith(stored, options);
    expect(document.body.dataset.pulse).toBe('off');
    expect(glows(game)).toEqual(Array(8).fill(0));
  });

  it('stops when the player turns reduced motion on, and comes back when they turn it off', async () => {
    const game = await bootWith(ON);
    game.openSettings();
    const motion = document.getElementById('setting-reduced-motion')!;
    motion.click();
    expect(document.body.dataset.pulse).toBe('off');
    expect(glows(game)).toEqual(Array(8).fill(0));
    motion.click();
    expect(document.body.dataset.pulse).toBe('on');
    expect(Math.max(...glows(game))).toBeGreaterThan(0);
  });
});

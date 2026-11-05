// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { FightState } from './openworldfight';
import './test/openworldwasm';
import { world_enemies } from 'abalone-wasm';
import { boot } from './test/harness';

// The wandering marbles and the wild fights of the Open world (#1511, docs/specs/openworld.md section 3b).
const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
};
/** The first seed with a generated marble within the 10 cells the page lists enemies at round the spawn. */
const seed = (() => {
  for (let n = 1; n < 100; n++) {
    for (const [cx, cy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as Axial[]) {
      const flat = world_enemies(n, cx, cy);
      for (let i = 0; i < flat.length; i += 2) if (Math.max(Math.abs(flat[i]!), Math.abs(flat[i + 1]!), Math.abs(flat[i]! + flat[i + 1]!)) <= 10) return n;
    }
  }
  throw new Error('no seed');
})();
type Hooks = { __openworldWander: (tick: number | null) => void; __openworldEnemies: () => Axial[] };
const hooks = () => window as unknown as Hooks;

describe('the clock of the wandering marbles', () => {
  it('stands at tick 0 under automation, moves the marbles when a spec sets another tick, and follows the real clock when asked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const game = await boot(`?bot=off&openworld=${seed}`);
    game.openModes();
    byId('openworld').click();
    await settle();
    const home = hooks().__openworldEnemies();
    expect(home.length).toBeGreaterThan(0);
    let away = -1;
    for (let tick = 1; tick < 400 && away < 0; tick++) {
      hooks().__openworldWander(tick);
      if (hooks().__openworldEnemies().some((c, i) => c.join() !== home[i]?.join())) away = tick;
    }
    expect(away).toBeGreaterThan(0);
    hooks().__openworldWander(0);
    expect(hooks().__openworldEnemies()).toEqual(home);
    // The real clock: the tick is the wall time in ticks of FightState.tickMs.
    vi.setSystemTime(away * FightState.tickMs);
    hooks().__openworldWander(null);
    expect(hooks().__openworldEnemies()).not.toEqual(home);
    vi.useRealTimers();
  });
});

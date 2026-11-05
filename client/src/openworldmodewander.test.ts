// @vitest-environment jsdom
import './test/openworldwasm';
import { world_chunk, world_enemies } from 'abalone-wasm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { OpenWorldMode } from './openworldmode';
import { OpenWorldView } from './openworldview';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The wandering marbles in the mode (docs/specs/openworld.md section 3b, #1511), on the real world of a seed: a group within the hero's
// reach whose chunk walks away from where it starts at some tick of the clock.
const body = () => document.body.dataset;
const found = (() => {
  for (let seed = 1; seed < 60; seed++) {
    for (let cx = -1; cx <= 0; cx++) {
      for (let cy = -1; cy <= 0; cy++) {
        const flat = world_enemies(seed, cx, cy);
        for (let i = 0; i < flat.length; i += 2) {
          if (Math.max(Math.abs(flat[i]!), Math.abs(flat[i + 1]!), Math.abs(flat[i]! + flat[i + 1]!)) > 10) continue;
          return { seed, home: [flat[i]!, flat[i + 1]!] as Axial };
        }
      }
    }
  }
  throw new Error('no enemy near the spawn');
})();
const made = (reduced = true) => {
  const m = new OpenWorldMode((seed, cx, cy) => world_chunk(seed, cx, cy), (seed, cx, cy) => Int32Array.from(world_enemies(seed, cx, cy)), async () => ({ low: {}, high: {} }), () => reduced, worldSaves(memoryStore(), 1));
  return m;
};
/** A tick at which the marble that starts on `home` is not on it: found by asking a mode that stands at that tick. */
const away = (() => {
  for (let tick = 1; tick < 400; tick++) {
    const m = made();
    m.wander = () => tick;
    m.enter(found.seed, 800, 600);
    const at = m.enemies().find((cell) => cell.join() !== found.home.join());
    const moved = !m.enemies().some((cell) => cell.join() === found.home.join());
    m.leave();
    if (moved && at) return tick;
  }
  throw new Error('the group never walks');
})();

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the wandering marbles in the Open world mode', () => {
  it('stands the marbles where they start at tick 0, and where the clock has them at another tick', () => {
    const still = made();
    still.enter(found.seed, 800, 600);
    expect(still.enemies()).toContainEqual(found.home);
    const walking = made();
    walking.wander = () => away;
    walking.enter(found.seed, 800, 600);
    expect(walking.enemies()).not.toContainEqual(found.home);
    expect(walking.enemies().length).toBe(still.enemies().length);
  });

  it('moves them when the clock ticks, draws it and rolls the ones that stepped; a tick that is the same changes nothing', () => {
    const m = made(false);
    let tick = 0;
    m.wander = () => tick;
    m.enter(found.seed, 800, 600);
    const render = vi.fn();
    const wander = vi.spyOn(OpenWorldView.prototype, 'wander');
    m.frame(render, 1000);
    m.frame(render, 1010);
    expect(wander).not.toHaveBeenCalled(); // the same tick: the marbles stay
    tick = away;
    m.frame(render, 1100);
    expect(wander).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalled();
    expect(m.enemies()).not.toContainEqual(found.home);
    wander.mockClear();
    m.frame(render, 1200);
    expect(wander).not.toHaveBeenCalled();
  });

  it('the hook that sets the clock moves them at once, ending a roll being drawn first', () => {
    const m = made(false);
    let tick = 0;
    m.wander = () => tick;
    m.enter(found.seed, 800, 600);
    tick = 1;
    m.stepWander(); // a first tick, which may roll marbles
    const snap = vi.spyOn(OpenWorldView.prototype, 'snap');
    tick = away;
    m.stepWander(undefined, true);
    expect(snap).toHaveBeenCalledTimes(1);
    expect(m.enemies()).not.toContainEqual(found.home);
  });

  it('waits for a push being drawn to end, then steps', () => {
    const m = made(false);
    let tick = 0;
    m.wander = () => tick;
    m.enter(found.seed, 800, 600);
    vi.spyOn(OpenWorldView.prototype, 'animating', 'get').mockReturnValue(true);
    tick = away;
    m.frame(vi.fn(), 1000);
    expect(m.enemies()).toContainEqual(found.home);
    vi.restoreAllMocks();
    m.frame(vi.fn(), 1100);
    expect(m.enemies()).not.toContainEqual(found.home);
  });

  it('does nothing in a world that is left', () => {
    const m = made();
    m.wander = () => 5;
    expect(() => m.stepWander()).not.toThrow();
    m.enter(found.seed, 800, 600);
    m.leave();
    expect(() => m.stepWander()).not.toThrow();
  });

  it('names a marble another hero beat by the cell it starts on, wherever it wandered to (#1305, #1511)', () => {
    const m = made();
    m.wander = () => away;
    m.enter(found.seed, 800, 600);
    const before = m.enemies().length;
    m.remoteBeaten(found.home);
    expect(m.enemies().length).toBe(before - 1);
    m.remoteBeaten(found.home); // beaten already
    expect(m.enemies().length).toBe(before - 1);
  });
});

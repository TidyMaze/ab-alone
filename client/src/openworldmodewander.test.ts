// @vitest-environment jsdom
import './test/openworldwasm';
import { world_chunk, world_enemies } from 'edgefall-wasm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { FLEE_GRACE_MS, OpenWorldMode } from './openworldmode';
import { FightState } from './openworldfight';
import { neighbours } from './openworld';
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

  it('tells the fight the cells of the troop before the clock, so no marble walks onto one (#1590)', () => {
    const m = made();
    let tick = 0;
    m.wander = () => tick;
    m.enter(found.seed, 800, 600);
    const held = vi.spyOn(FightState.prototype, 'setHeld');
    const clock = vi.spyOn(FightState.prototype, 'setClock');
    tick = away;
    m.stepWander();
    expect(held).toHaveBeenCalledTimes(1);
    expect(held.mock.calls[0]![0].length).toBeGreaterThan(0);
    expect(held.mock.invocationCallOrder[0]!).toBeLessThan(clock.mock.invocationCallOrder[0]!);
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

describe('a marble that touches the hero starts a wild fight (#1511)', () => {
  /** A mode on the found world with the clock at `tick` and a recorder for the wild fight. */
  const setup = (tick = 0, reduced = true) => {
    const m = made(reduced);
    let now = tick;
    m.wander = () => now;
    const onWild = vi.fn();
    m.onWild = onWild;
    m.enter(found.seed, 800, 600);
    return { m, onWild, clock: (t: number) => (now = t) };
  };
  /** The cell the marble that starts on `found.home` stands on at the tick `away`, and a neighbour of it that is 2 or more from home. */
  const there = (() => {
    const m = made();
    m.wander = () => away;
    m.enter(found.seed, 800, 600);
    const at = m.enemies().find((cell) => !m.enemies().some((c) => c.join() === found.home.join()) || cell.join() !== found.home.join())!;
    m.leave();
    const near = neighbours(at).find((cell) => Math.max(Math.abs(cell[0] - found.home[0]), Math.abs(cell[1] - found.home[1]), Math.abs(cell[0] - found.home[0] + cell[1] - found.home[1])) >= 2)!;
    return { at, near };
  })();
  const next = neighbours(found.home)[0]!;
  afterEach(() => vi.restoreAllMocks());

  it('starts when the hero is put next to a marble, with the seed and the cell the marble starts on, and ends the walk and the keys', () => {
    const { m, onWild } = setup();
    m.fixture({ hero: next, troop: [] });
    expect(onWild).toHaveBeenCalledTimes(1);
    expect(onWild).toHaveBeenCalledWith(found.seed, found.home, [], []); // no special marble brought
    expect(m.key('ArrowUp')).toBe(false);
    expect(m.key('Escape')).toBe(false);
    expect((m as unknown as { roll(to: Axial): boolean }).roll([next[0], next[1] + 1])).toBe(false); // no step either: a press or a walk under way
    expect(m.hero!.at).toEqual(next);
    expect(m.active).toBe(true); // the page leaves the world when the transition is half way
    m.fixture({ hero: next, troop: [] });
    expect(onWild).toHaveBeenCalledTimes(1); // once
  });

  it('tells the special marbles the army brings (#1655): a copy of the loadout the fixture set', () => {
    const { m, onWild } = setup();
    const army = { specials: [1, 9], brought: [9, 1], relics: [0, 4], relicsBrought: [4, 0] };
    m.fixture({ hero: next, troop: [], army });
    expect(onWild).toHaveBeenCalledWith(found.seed, found.home, [9, 1], [4, 0]); // and the relics it brings
    expect(onWild.mock.calls[0]![2]).not.toBe(army.brought);
    expect(onWild.mock.calls[0]![3]).not.toBe(army.relicsBrought);
  });

  it('is saved with the hero where it stands, and a world entered again fights again', async () => {
    const saves = worldSaves(memoryStore(), 1);
    const m = new OpenWorldMode((seed, cx, cy) => world_chunk(seed, cx, cy), (seed, cx, cy) => Int32Array.from(world_enemies(seed, cx, cy)), async () => ({ low: {}, high: {} }), () => true, saves);
    m.onWild = vi.fn();
    await m.open(found.seed, 800, 600);
    m.fixture({ hero: next, troop: [] });
    m.leave();
    expect((await saves.load(found.seed))!.hero).toEqual(next);
    await m.open(found.seed, 800, 600);
    expect(m.key('ArrowUp')).toBe(true);
  });

  it('counts the frames it draws since the open, and no frame it skips: a spec waits for the first draw (#1601)', () => {
    const m = made();
    m.enter(found.seed, 800, 600);
    expect(m.drawn).toBe(0);
    m.frame(vi.fn(), 1000);
    expect(m.drawn).toBe(1);
    m.frame(vi.fn(), 1001); // nothing moved: no draw
    expect(m.drawn).toBe(1);
    (m as unknown as { dirty: boolean }).dirty = true;
    m.frame(vi.fn(), 1002);
    expect(m.drawn).toBe(2);
  });

  it('gives a world just opened 5 s: the marble next to the hero fights when the calm ends, once', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const m = made();
    const onWild = vi.fn();
    m.onWild = onWild;
    m.enter(found.seed, 800, 600);
    m.hero!.at = next;
    m.frame(vi.fn(), 1000); // the first draw of the world starts the calm (#1511)
    m.frame(vi.fn(), 1000 + FLEE_GRACE_MS - 1);
    expect(onWild).not.toHaveBeenCalled();
    m.frame(vi.fn(), 1000 + FLEE_GRACE_MS);
    expect(onWild).toHaveBeenCalledWith(found.seed, found.home, [], []); // no special marble brought
    m.frame(vi.fn(), 1000 + FLEE_GRACE_MS + 20);
    expect(onWild).toHaveBeenCalledTimes(1);
  });

  it('starts the 5 s calm on the first draw, not on the open: a world that has not drawn in 5 s keeps its marble calm (#1511, under software GL)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const m = made();
    const onWild = vi.fn();
    m.onWild = onWild;
    m.enter(found.seed, 800, 600);
    m.hero!.at = next;
    const render = vi.fn();
    m.frame(render, 1000 + 10 * FLEE_GRACE_MS); // a slow first frame: 50 s after the open, the world draws now
    expect(render).toHaveBeenCalledTimes(1);
    expect(onWild).not.toHaveBeenCalled();
    m.frame(vi.fn(), 1000 + 10 * FLEE_GRACE_MS + FLEE_GRACE_MS - 1);
    expect(onWild).not.toHaveBeenCalled();
    m.frame(vi.fn(), 1000 + 10 * FLEE_GRACE_MS + FLEE_GRACE_MS);
    expect(onWild).toHaveBeenCalledTimes(1);
  });

  it('starts when the hero rolls up to a marble, and the troop does not push it', () => {
    const { m, onWild } = setup();
    const troopPush = vi.spyOn(FightState.prototype, 'troopPush');
    const two = neighbours(next).find((cell) => Math.max(Math.abs(cell[0] - found.home[0]), Math.abs(cell[1] - found.home[1]), Math.abs(cell[0] - found.home[0] + cell[1] - found.home[1])) === 2)!;
    m.fixture({ hero: two, troop: [] });
    expect(onWild).not.toHaveBeenCalled();
    (m as unknown as { roll(to: Axial): boolean }).roll(next);
    expect(onWild).toHaveBeenCalledTimes(1);
    expect(troopPush).not.toHaveBeenCalled();
    expect(m.hero!.at).toEqual(next);
  });

  it('starts when the marble walks up to the hero, on the tick it arrives', () => {
    const { m, onWild, clock } = setup();
    m.fixture({ hero: there.near, troop: [] });
    expect(onWild).not.toHaveBeenCalled();
    clock(away);
    m.stepWander();
    expect(onWild).toHaveBeenCalledTimes(1);
    expect(onWild.mock.calls[0]![1]).toEqual(found.home);
  });

  it('starts nothing the page does not take up: without a handler a contact is only marked', () => {
    const m = made();
    m.enter(found.seed, 800, 600);
    expect(() => m.fixture({ hero: next, troop: [] })).not.toThrow();
    expect(m.key('ArrowUp')).toBe(false);
  });

  it('a marble the troop pushed is no wanderer: it fights nobody', () => {
    const { m, onWild } = setup();
    m.fixture({ hero: [200, 200], troop: [], enemies: [[200, 201]] }); // a pushed marble next to the hero
    expect(onWild).not.toHaveBeenCalled();
  });

  it('does not stop the walk of a hero away from the marbles, and a left world fights nobody', () => {
    const { m, onWild } = setup();
    m.fixture({ hero: [0, 0], troop: [] });
    expect(m.key('ArrowUp')).toBe(true);
    m.release('ArrowUp');
    m.leave();
    expect(onWild).not.toHaveBeenCalled();
  });
});

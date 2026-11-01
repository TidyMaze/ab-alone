// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { axialTo3D } from './board';
import { CHUNK } from './openworld';
import { CRUISE_MS, GLIDE_MS } from './openworldglide';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import type { OpenWorldView } from './openworldview';

// #1065: a held walk draws the hero at one speed from cell to cell, the camera follows it; a step begins on the frame that is due
// and is drawn on it; the release slows the step under way to a rest on its cell; a single tap eases out.

// Grass at height 1; when `walled`, gantry walls on (3, 0), (3, -1) and (2, 1): a pocket at (2, 0) with no free way on (#1137).
const land = (walled: boolean) => (_seed: number, cx: number, cy: number): Uint8Array => {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 0], i * 3);
  if (walled && cx === 0 && cy === 0) for (const [q, r] of [[3, 0], [2, 1]]) out.set([1, 7, 0], (r! * CHUNK + q!) * 3);
  if (walled && cx === 0 && cy === -1) out.set([1, 7, 0], (15 * CHUNK + 3) * 3);
  return out;
};
const make = (reduced: boolean, walled = false): OpenWorldMode => {
  const m = new OpenWorldMode(
    land(walled),
    () => new Int32Array(),
    async () => ({ low: {}, high: {} }),
    () => reduced,
    worldSaves(memoryStore(), 1),
  );
  m.enter(1, 800, 600);
  return m;
};
/** The camera's x, which follows the hero's drawn place. */
const focusX = (m: OpenWorldMode): number => ((m as unknown as { view: OpenWorldView }).view.focusPoint).x;
const CELL = axialTo3D(1, 0).x - axialTo3D(0, 0).x;
const FRAME = 1000 / 60;

let clock = 0;
const setClock = (): void => void vi.spyOn(performance, 'now').mockImplementation(() => clock);
afterEach(() => {
  vi.restoreAllMocks();
  clock = 0;
});

/** Draws the frames at 60 Hz from `from` to `to` ms, `render` counting the draws; returns the focus x of each frame. */
function frames(m: OpenWorldMode, from: number, to: number, render = vi.fn()): number[] {
  const xs: number[] = [];
  for (let t = from; t <= to; t += FRAME) {
    clock = t;
    m.frame(render, t);
    xs.push(focusX(m));
  }
  return xs;
}

describe('a held arrow in the Open world, #1065', () => {
  it('draws the same distance on every frame while it walks: under 10 % apart, and the camera moves with it', () => {
    setClock();
    const m = make(false);
    m.frame(vi.fn(), 0);
    expect(m.key('ArrowRight')).toBe(true);
    const xs = frames(m, FRAME, 20 * GLIDE_MS);
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    const steady = steps.slice(Math.ceil(800 / FRAME) + 1); // past the speed-up to the cruise pace (#1290)
    expect(steady.length).toBeGreaterThan(50);
    expect((Math.max(...steady) - Math.min(...steady)) / Math.min(...steady)).toBeLessThan(0.1);
    expect(Math.min(...steady)).toBeGreaterThan(0.9 * ((CELL * FRAME) / CRUISE_MS));
    expect(m.hero!.at[0]).toBeGreaterThanOrEqual(9);
  });

  it('draws a step on the frame that begins it, not on the next one', () => {
    setClock();
    const m = make(false);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    frames(m, FRAME, GLIDE_MS - 1); // the first step is under way, the second due at GLIDE_MS
    const before = focusX(m);
    const cell = m.hero!.at[0];
    clock = GLIDE_MS + 1;
    m.frame(vi.fn(), GLIDE_MS + 1); // a frame a little late: the step is made and drawn on it
    expect(m.hero!.at[0]).toBe(cell + 1);
    expect(focusX(m)).toBeGreaterThan(before + 0.5 * CELL * (1 / GLIDE_MS) * 1); // moved at the speed, on this very frame
  });

  it('slows the step under way to a rest on its cell when the arrow is let go, with no step after it', () => {
    setClock();
    const m = make(false);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    frames(m, FRAME, 3 * GLIDE_MS + 60);
    clock = 3 * GLIDE_MS + 70;
    m.release('ArrowRight');
    const cell = m.hero!.at[0];
    const xs = frames(m, 3 * GLIDE_MS + 70, 5 * GLIDE_MS);
    expect(m.hero!.at[0]).toBe(cell);
    const goal = axialTo3D(cell, 0).x;
    expect(xs.at(-1)).toBeCloseTo(goal, 6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(goal + 1e-9); // it never passes its cell
    const last = xs.slice(-6).map((x, i, all) => (i ? x - all[i - 1]! : 0));
    expect(Math.max(...last)).toBeLessThan(1e-3);
  });

  it('keeps the ease-out of a single tap', () => {
    setClock();
    const m = make(false);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    m.release('ArrowRight');
    clock = GLIDE_MS / 2;
    m.frame(vi.fn(), GLIDE_MS / 2);
    expect(focusX(m)).toBeCloseTo(0.875 * CELL, 6);
    clock = GLIDE_MS + 1;
    m.frame(vi.fn(), GLIDE_MS + 1);
    expect(focusX(m)).toBeCloseTo(CELL, 6);
  });

  it('brakes at a wall: the blocked step slows the hero to a rest on its cell, and a new press walks on from rest', () => {
    setClock();
    const m = make(false, true);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    const xs = frames(m, FRAME, 6 * GLIDE_MS);
    expect(m.hero!.at).toEqual([2, 0]);
    expect(xs.at(-1)).toBeCloseTo(axialTo3D(2, 0).x, 6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(axialTo3D(2, 0).x + 0.2 * CELL + 1e-9); // the lean of the blocked step goes a fifth of a cell past it
    m.release('ArrowRight');
    m.key('ArrowLeft');
    clock = 6 * GLIDE_MS + 5;
    m.frame(vi.fn(), clock);
    expect(m.hero!.at).toEqual([2, -1]); // Left leans forward, up-left (#1273)
    expect(focusX(m)).toBeGreaterThan(axialTo3D(2, 0).x - 0.03 * CELL); // a start from rest: it has hardly moved
  });

  it('brakes when the arrows held cancel each other, and starts again from rest when one is let go', () => {
    setClock();
    const m = make(false);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    frames(m, FRAME, GLIDE_MS + 20);
    m.key('ArrowLeft'); // opposite arrows: no step on the next beat
    const cell = m.hero!.at[0];
    const xs = frames(m, GLIDE_MS + 20 + FRAME, 3 * GLIDE_MS);
    expect(m.hero!.at[0]).toBe(cell);
    expect(xs.at(-1)).toBeCloseTo(axialTo3D(cell, 0).x, 6);
  });

  it('restarts from rest after a hidden tab: more than a step late, the step begins on that frame', () => {
    setClock();
    const m = make(false);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    frames(m, FRAME, GLIDE_MS - 1);
    const cell = m.hero!.at[0];
    clock = 10_000;
    m.frame(vi.fn(), 10_000);
    expect(m.hero!.at[0]).toBe(cell + 1);
    clock = 10_001;
    m.frame(vi.fn(), 10_001);
    expect(focusX(m) - axialTo3D(cell, 0).x).toBeLessThan(0.01 * CELL); // from rest, not at the walking speed
  });

  it('walks cell by cell without glide under reduced motion: the camera jumps, nothing is drawn in between', () => {
    setClock();
    const m = make(true);
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    const xs = frames(m, FRAME, 4 * GLIDE_MS);
    const jumps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (const d of jumps) expect(Math.abs(d) < 1e-9 || Math.abs(d - CELL) < 1e-6).toBe(true);
    expect(m.hero!.at[0]).toBeGreaterThanOrEqual(4);
  });
});

describe('the frame reports whether it drew, #1064', () => {
  it('returns true for a frame that renders, false for one that finds nothing changed', () => {
    const m = make(true);
    const render = vi.fn();
    expect(m.frame(render, 0)).toBe(true); // the first draw
    expect(m.frame(render, FRAME)).toBe(false); // a still scene
    expect(render).toHaveBeenCalledTimes(1);
    m.resize(400, 300);
    expect(m.frame(render, 2 * FRAME)).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('returns false once the mode is left', () => {
    const m = make(true);
    m.key('Escape');
    expect(m.frame(vi.fn(), 0)).toBe(false);
  });
});

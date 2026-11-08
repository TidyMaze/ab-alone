// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { world_chunk } from 'edgefall-wasm';
import type { Axial } from './board';
import { STEP_GAP_MS, type WorldCue } from './cues';
import { CHUNK } from './openworld';
import { GLIDE_MS } from './openworldglide';
import { OpenWorldMode } from './openworldmode';
import { OpenWorldView } from './openworldview';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { WORLD_LOGS } from './lorelogs';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The cues of the Open world (#1570, world.md section 7): a step of the hero, a pickup (a marble that joins the troop, a lore log
// found) and the time of day moving to dusk or night. The mode tells its `cue` and the page plays it; the troop's marbles make no
// step of their own, a teleport is no step and a walk to a far cell is silent but for its last step.
const MIN = 60_000;
const body = () => document.body.dataset;
const grass = (_seed: number, cx: number, cy: number): Uint8Array => {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
};
let clock = 0;
const nobody = (): Int32Array => new Int32Array();
function make(load = grass, ...more: unknown[]) {
  const m = new OpenWorldMode(load, nobody, async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), ...(more as []));
  const heard: WorldCue[] = [];
  m.cue = (event) => heard.push(event);
  return { m, heard };
}
const tap = (m: OpenWorldMode, key: string): void => {
  m.key(key);
  m.release(key);
};
const frameAt = (m: OpenWorldMode, ms: number): void => {
  clock = ms;
  m.frame(vi.fn(), clock);
};

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the step of the hero (#1570)', () => {
  it('a step sounds once, a blocked one never', () => {
    const { m, heard } = make();
    m.enter(7, 800, 600);
    tap(m, 'ArrowRight');
    expect(heard).toEqual(['step']);
    clock += 1000;
    m.fixture({ hero: [0, 0], troop: [[-1, 0], [-2, 0]], enemies: [[1, 0], [1, -1], [0, 1]] }); // a wall of enemies ahead: the hero leans and stays
    tap(m, 'ArrowRight');
    expect(body().openworldAt).toBe('0,0');
    expect(heard).toEqual(['step']);
  });

  it('a held walk at normal speed sounds each step: one cell every 140 ms is more than the gap', () => {
    expect(GLIDE_MS).toBeGreaterThan(STEP_GAP_MS);
    const { m, heard } = make();
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    for (let i = 1; i <= 2; i++) frameAt(m, i * GLIDE_MS); // the first step at the key, then two on the cadence
    expect(heard).toEqual(['step', 'step', 'step']);
  });

  it('a walk at cruising speed does not chatter: no more than one step cue per gap', () => {
    const { m, heard } = make();
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    let at = 0;
    for (let i = 0; i < 40; i++) frameAt(m, (at += 20));
    expect(Number(body().openworldAt!.split(',')[0])).toBeGreaterThan(heard.length); // more steps than cues
    expect(heard.length).toBeLessThanOrEqual(Math.ceil(at / STEP_GAP_MS) + 1);
  });

  it('a pickup takes the place of the step of the move that makes it, one cue for the move', () => {
    const { m, heard } = make(real);
    m.enter(1, 800, 600);
    m.fixture({ hero: [11, -29], troop: [], enemies: [[12, -30]] });
    tap(m, 'ArrowLeft'); // the shove of the recruit test: an enemy ejected into the water joins the troop
    expect(body().openworldRecruits).toBe('1');
    expect(heard).toEqual(['pickup']);
  });
});

describe('a walk to a far cell and a teleport (#1570)', () => {
  const route = (...cells: Axial[]) => () => Int32Array.from(cells.flat());
  it('a walk to a far cell is silent but for its last step', () => {
    vi.spyOn(OpenWorldView.prototype, 'pickGround').mockReturnValue([3, 0]);
    const { m, heard } = make(grass, undefined, undefined, undefined, undefined, undefined, route([1, 0], [2, 0], [3, 0]), () => true);
    m.enter(5, 800, 600);
    m.press(400, 300, 800, 600);
    expect(heard).toEqual([]); // the first two cells, at once and one glide later
    frameAt(m, GLIDE_MS);
    expect(heard).toEqual([]);
    frameAt(m, 2 * GLIDE_MS);
    expect(m.hero!.at).toEqual([3, 0]);
    expect(heard).toEqual(['step']); // it arrived
  });
});

describe('the pickup of a lore log (#1570)', () => {
  const LOGS = Int32Array.of(4, 0);
  const page = '<div id="openworld-log" hidden><h2 id="openworld-log-title"></h2><p id="openworld-log-body"></p></div>';
  it('sounds the first time the hero rolls onto a log, not the next time', () => {
    document.body.innerHTML = page;
    const none = Array.from({ length: 11 }, () => undefined);
    const { m, heard } = make(grass, ...none, () => LOGS, vi.fn());
    m.enter(7, 800, 600);
    for (let i = 0; i < 2; i++) {
      clock += 1000;
      m.fixture({ hero: [3, 0], troop: [], enemies: [] });
      tap(m, 'ArrowRight');
    }
    expect(WORLD_LOGS.length).toBeGreaterThan(0);
    expect(heard).toEqual(['pickup', 'step']);
  });
});

describe('the time of day (#1570)', () => {
  it('sounds when the phase moves to dusk, not at the start nor while it stays', () => {
    const { m, heard } = make();
    m.enter(7, 800, 600);
    frameAt(m, 1000);
    frameAt(m, 1100);
    expect(heard).toEqual([]);
    m.setTime(6 * MIN - 150);
    frameAt(m, 1200);
    expect(heard).toEqual([]);
    frameAt(m, 1300);
    expect(m.phase).toBe('dusk');
    expect(heard).toEqual(['time-of-day']);
    frameAt(m, 1400);
    expect(heard).toEqual(['time-of-day']);
  });

  it('a world entered again starts over: its first phase is silent', () => {
    const { m, heard } = make();
    m.enter(7, 800, 600);
    m.setTime(7 * MIN);
    frameAt(m, 1000);
    m.leave();
    m.enter(7, 800, 600);
    m.setTime(7 * MIN);
    frameAt(m, 2000);
    expect(heard).toEqual([]);
  });

  it('does nothing by itself: a mode with no listener plays no cue and does not fail', () => {
    const m = new OpenWorldMode(grass, nobody, async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1));
    m.enter(7, 800, 600);
    tap(m, 'ArrowRight');
    m.setTime(7 * MIN);
    frameAt(m, 1000);
    expect(body().openworldAt).toBe('1,0');
  });
});

const real = (seed: number, cx: number, cy: number): Uint8Array => world_chunk(seed, cx, cy);

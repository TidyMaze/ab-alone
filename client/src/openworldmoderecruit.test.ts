// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { world_chunk } from 'edgefall-wasm';
import type { Axial } from './board';
import { CHUNK } from './openworld';
import { FightState } from './openworldfight';
import { DEFAULT_YAW, OpenWorldMode } from './openworldmode';
import { RECRUIT_MAX } from './openworldrecruit';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// A marble a push ejects joins the troop (#1531, docs/specs/openworld.md section 16). Seed 1: the hero on (11, -29) steps left to (11, -30), the foe
// on (12, -30) has water on (13, -30) behind it, and the lone hero shoves it in (#1504). The islet is the same world with water everywhere but on the foe's cell.
const real = (seed: number, cx: number, cy: number): Uint8Array => world_chunk(seed, cx, cy);
function islet(seed: number, cx: number, cy: number): Uint8Array {
  const out = real(seed, cx, cy).slice();
  for (let i = 0; i < out.length / 3; i++) {
    if (!(cx * CHUNK + (i % CHUNK) === 12 && cy * CHUNK + Math.floor(i / CHUNK) === -30)) out[i * 3 + 1] = 0;
  }
  return out;
}
const nobody = (): Int32Array => new Int32Array();
const mode = (load = real, reduced = true, saves = worldSaves(memoryStore(), 1)) =>
  new OpenWorldMode(load, nobody, async () => ({ low: {}, high: {} }), () => reduced, saves);
const body = () => document.body.dataset;
const line = () => document.getElementById('openworld-recruits')!;
const tap = (m: OpenWorldMode, key: string): void => {
  m.key(key);
  m.release(key);
};
/** The seed 1 shove: the hero beside the water, a foe to shove in. */
const shove = (m: OpenWorldMode): void => {
  m.enter(1, 800, 600);
  m.fixture({ hero: [11, -29], troop: [], enemies: [[12, -30]] });
  tap(m, 'ArrowLeft');
};
const near = (a: Axial, b: Axial): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] - b[0] + a[1] - b[1])) / 2;

beforeEach(() => {
  document.body.innerHTML = '<p id="openworld-recruits" hidden></p>';
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('a marble the troop ejects joins it (#1531)', () => {
  it('a push that ejects a marble brings a recruit: one more marble in the troop beside the hero, counted and told on the plate', () => {
    const m = mode();
    shove(m);
    expect(body().openworldBeaten).toBe('1');
    expect(m.hero!.at).toEqual([12, -30]);
    expect(m.hero!.troop).toHaveLength(1);
    const [cell] = m.hero!.troop;
    expect(near(cell!, m.hero!.at)).toBe(1);
    expect(body().openworldRecruits).toBe('1');
    expect(body().openworldTroop).toBe(cell!.join(','));
    expect(line().hidden).toBe(false);
    expect(line().textContent).toBe('A marble joins the troop. Recruits 1 / 5');
  });

  it('a push that ejects nothing recruits nothing, and the plate line stays hidden', () => {
    const m = mode((_seed, cx, cy) => new Uint8Array(real(1, cx, cy)));
    m.enter(1, 800, 600);
    m.fixture({ hero: [11, -29], troop: [], enemies: [[40, 40]] });
    tap(m, 'ArrowLeft');
    expect(body().openworldRecruits).toBe('0');
    expect(m.hero!.troop).toHaveLength(0);
    expect(line().hidden).toBe(true);
  });

  it('the recruit is a troop marble in every rule: it flocks with the troop on the next step, and the next shove counts it in the line', () => {
    const m = mode();
    shove(m);
    const [first] = m.hero!.troop;
    tap(m, 'ArrowRight');
    expect(m.hero!.troop).toHaveLength(1);
    expect(near(m.hero!.troop[0]!, m.hero!.at)).toBeLessThanOrEqual(3);
    expect(first).toBeDefined();
  });

  it('past the cap the marble is ejected and counted but no recruit joins', async () => {
    const saves = worldSaves(memoryStore(), 1);
    const crowd = Array.from({ length: 15 + RECRUIT_MAX }, (_, i): Axial => [i % 5, -20 - Math.floor(i / 5)]);
    await saves.put(1, [11, -29], crowd, new FightState(), DEFAULT_YAW, [], [], [], 0, [], RECRUIT_MAX);
    const m = mode(real, true, saves);
    await m.open(1, 800, 600);
    expect(body().openworldRecruits).toBe(String(RECRUIT_MAX));
    expect(line().textContent).toBe('Recruits 5 / 5');
    m.fixture({ hero: [11, -29], troop: m.hero!.troop, enemies: [[12, -30]] });
    tap(m, 'ArrowLeft');
    expect(body().openworldBeaten).toBe('1');
    expect(body().openworldRecruits).toBe(String(RECRUIT_MAX));
    expect(m.hero!.troop).toHaveLength(15 + RECRUIT_MAX);
    expect(line().textContent).toBe('Recruits 5 / 5');
  });

  it('with no free cell within three of the hero, the cap is not spent', () => {
    const m = mode(islet);
    shove(m); // the hero sails to (11, -30) and shoves the foe off its islet: it takes the islet, and nothing round it is free
    expect(body().openworldBeaten).toBe('1');
    expect(body().openworldRecruits).toBe('0');
    expect(m.hero!.troop).toHaveLength(0);
    expect(line().hidden).toBe(true);
  });

  it('draws the recruit while the push is drawn, with the motion on, and once the push has landed', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const m = mode(real, false);
    shove(m);
    expect(m.hero!.troop).toHaveLength(1);
    expect(JSON.parse(body().openworldDrawn!).troop).toBe(1);
    m.frame(vi.fn(), 5000);
    expect(JSON.parse(body().openworldDrawn!).troop).toBe(1);
  });

  it('is saved with the world and comes back on a reload: the troop, the count and the plate line', async () => {
    const saves = worldSaves(memoryStore(), 1);
    const first = mode(real, true, saves);
    shove(first);
    first.frame(vi.fn());
    await new Promise((done) => setTimeout(done));
    const saved = (await saves.load(1))!;
    expect(saved.recruits).toBe(1);
    expect(saved.troop).toHaveLength(1);
    first.leave();
    const again = mode(real, true, saves);
    await again.open(1, 800, 600);
    expect(body().openworldRecruits).toBe('1');
    expect(line().textContent).toBe('Recruits 1 / 5');
    expect(again.hero!.troop).toEqual(saved.troop);
  });

  it('a new world has none, and leaving the world clears the count and hides the line', () => {
    const m = mode();
    m.enter(1, 800, 600);
    expect(body().openworldRecruits).toBe('0');
    expect(line().hidden).toBe(true);
    shove(m);
    m.leave();
    expect(body().openworldRecruits).toBeUndefined();
    expect(line().hidden).toBe(true);
  });

  it('the fixture can set the recruits of a world, up to the cap', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.fixture({ hero: [0, 0], troop: [], enemies: [], recruits: 3 });
    expect(body().openworldRecruits).toBe('3');
    expect(line().textContent).toBe('Recruits 3 / 5');
    m.fixture({ hero: [0, 0], troop: [], enemies: [], recruits: 99 });
    expect(body().openworldRecruits).toBe(String(RECRUIT_MAX));
  });
});

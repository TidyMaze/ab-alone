// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './test/openworldwasm';
import { WALK_LESSON } from './hubcoach';
import { CHUNK } from './openworld';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import type { Axial } from './board';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The one lesson of the roll (#1604, docs/specs/openworld.md section 14): the Open world opens its controls with the lesson on the first
// entry, the first roll ends it and saves the key the Hub reads too, and it never comes back.

function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 4], i * 3);
  return out;
}
const LAIRS = Int32Array.of(3, 0, -4, 2);
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};
const setup = (store: ReturnType<typeof memory> | null) => {
  const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), () => LAIRS);
  m.store = store;
  return m;
};
const lesson = () => document.getElementById('openworld-lesson')!;
const controls = () => document.getElementById('openworld-controls') as HTMLDetailsElement;
const roll = (m: OpenWorldMode, to: Axial): boolean => (m as unknown as { roll(to: Axial): boolean }).roll(to);

beforeEach(() => {
  document.body.innerHTML =
    '<div id="openworld-hud"><p id="openworld-goal"></p><p id="openworld-bearing"></p><details id="openworld-controls"><summary>Controls</summary><p id="openworld-lesson" hidden></p></details></div><button id="openworld-chip" hidden></button>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('the one lesson of the roll in the Open world (#1604)', () => {
  it('opens the controls on the first entry, with the lesson the Hub also shows', () => {
    const store = memory();
    setup(store).enter(7, 800, 600);
    expect(controls().open).toBe(true);
    expect(lesson().hidden).toBe(false);
    expect(lesson().textContent).toBe(WALK_LESSON);
  });

  it('a roll ends it: the lesson goes, the key is saved, and the next entry keeps the controls closed', () => {
    const store = memory();
    const m = setup(store);
    m.enter(7, 800, 600);
    m.fixture({ hero: [0, 0], troop: [], enemies: [] });
    expect(roll(m, [1, 0])).toBe(true);
    expect(lesson().hidden).toBe(true);
    expect(store.getItem('ab-alone.hubcoach')).toBe('done');
    controls().open = false;
    setup(store).enter(7, 800, 600);
    expect(controls().open).toBe(false);
    expect(lesson().hidden).toBe(true);
  });

  it('a roll with no lesson line on the page still saves the key and does not throw', () => {
    const store = memory();
    const m = setup(store);
    m.enter(7, 800, 600);
    lesson().remove();
    m.fixture({ hero: [0, 0], troop: [], enemies: [] });
    expect(roll(m, [1, 0])).toBe(true);
    expect(store.getItem('ab-alone.hubcoach')).toBe('done');
  });

  it('a player who rolled in the Hub before never sees it in the Open world', () => {
    const store = memory();
    store.setItem('ab-alone.hubcoach', 'done');
    setup(store).enter(7, 800, 600);
    expect(controls().open).toBe(false);
    expect(lesson().hidden).toBe(true);
  });

  it('shows nothing without storage: the page keeps the controls closed', () => {
    setup(null).enter(7, 800, 600);
    expect(controls().open).toBe(false);
    expect(lesson().hidden).toBe(true);
  });
});

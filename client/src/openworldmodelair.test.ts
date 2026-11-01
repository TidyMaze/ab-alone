// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { CHUNK } from './openworld';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';

// Open grass everywhere in the square -3..3 of chunks; the lairs stand at (3, 0) and (-4, 2), lair 0 beaten in `saved`.
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 4], i * 3);
  return out;
}
const LAIRS = Int32Array.of(3, 0, -4, 2);
const setup = (beaten: number[] = []) => {
  const store = memoryStore();
  const saves = worldSaves(store, 1);
  const lairsOf = vi.fn(() => LAIRS);
  const onLair = vi.fn();
  const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, () => new Int32Array(), saves, lairsOf, onLair);
  return { m, saves, lairsOf, onLair, beaten };
};
const body = () => document.body.dataset;

afterEach(() => {
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the boss lairs of the Open world mode (#1170)', () => {
  it('publishes the lair cells and the beaten ones on entering, and draws a landmark on each', async () => {
    const { m, saves, lairsOf } = setup();
    await saves.put(7, [0, 0], [], (await import('./openworldfight')).FightState.fromJSON({ removed: [], added: [], beaten: 0 }), 0, [], [1]);
    await m.open(7, 800, 600);
    expect(lairsOf).toHaveBeenCalledWith(7);
    expect(body().openworldLairs).toBe('3,0 -4,2');
    expect(body().openworldLairsBeaten).toBe('1');
    m.leave();
    expect(body().openworldLairs).toBeUndefined();
    expect(body().openworldLairsBeaten).toBeUndefined();
  });

  it('publishes no beaten lair for a world with no save', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    expect(body().openworldLairs).toBe('3,0 -4,2');
    expect(body().openworldLairsBeaten).toBe('');
  });

  it('stepping onto a lair cell from its entrance starts the lair: the mode is left, the hero stays on the entrance and the save keeps it', async () => {
    const { m, saves, onLair } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, 0], troop: [[1, 0]], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(onLair).toHaveBeenCalledWith(7, 0);
    expect(m.active).toBe(false);
    for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.hero).toEqual([2, 0]);
  });

  it('starts the second lair too, and a lair already beaten again', () => {
    const { m, onLair } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [-3, 2], troop: [], enemies: [] });
    m.key('ArrowLeft');
    m.release('ArrowLeft');
    expect(onLair).toHaveBeenCalledWith(7, 1);
  });

  it('ignores a press on a lair cell the hero is not next to', () => {
    const { m, onLair } = setup();
    m.enter(7, 800, 600);
    (m as unknown as { roll(to: Axial): void }).roll([3, 0]);
    expect(onLair).not.toHaveBeenCalled();
    expect(m.active).toBe(true);
  });

  it('leaves the world on a lair even when nothing is listening for it', () => {
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, () => new Int32Array(), worldSaves(memoryStore(), 1), () => LAIRS);
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(m.active).toBe(false);
  });

  it('saves the beaten lairs it was opened with', async () => {
    const { m, saves } = setup();
    await saves.put(7, [0, 0], [], (await import('./openworldfight')).FightState.fromJSON({ removed: [], added: [], beaten: 0 }), 0, [], [0]);
    await m.open(7, 800, 600);
    m.fixture({ hero: [1, 0], troop: [], enemies: [] });
    m.key('ArrowLeft');
    m.release('ArrowLeft');
    m.leave();
    for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.lairs).toEqual([0]);
  });
});

describe('the medal count of the Open world HUD (#1171)', () => {
  const withMedals = (medals: () => { have: number; total: number }) =>
    new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, () => new Int32Array(), worldSaves(memoryStore(), 1), () => LAIRS, () => {}, undefined, medals);

  it('writes "Medals N / total" in the HUD when a world opens, and leaves the page alone without a HUD', () => {
    const out = document.createElement('output');
    out.id = 'openworld-medals';
    document.body.append(out);
    const m = withMedals(() => ({ have: 3, total: 14 }));
    m.enter(7, 800, 600);
    expect(out.textContent).toBe('Medals 3 / 14');
    out.remove();
    m.enter(7, 800, 600); // no element: nothing to write to
    expect(body().openworld).toBe('7');
  });

  it('counts no medal by default', () => {
    const out = document.createElement('output');
    out.id = 'openworld-medals';
    document.body.append(out);
    setup().m.enter(7, 800, 600);
    expect(out.textContent).toBe('Medals 0 / 0');
    out.remove();
  });
});

describe("Tally's line in the Open world HUD (#1171)", () => {
  const withTally = (tally: () => string) =>
    new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, () => new Int32Array(), worldSaves(memoryStore(), 1), () => LAIRS, () => {}, undefined, undefined, tally);

  it('writes the line the page gives when a world opens, and clears it when the page gives none', () => {
    const out = document.createElement('p');
    out.id = 'openworld-tally';
    document.body.append(out);
    const lines = ['Claim 0412: unworked.', ''];
    const m = withTally(() => lines.shift()!);
    m.enter(7, 800, 600);
    expect(out.textContent).toBe('Claim 0412: unworked.');
    m.enter(7, 800, 600);
    expect(out.textContent).toBe('');
    out.remove();
    m.enter(7, 800, 600); // no element: nothing to write to
    expect(body().openworld).toBe('7');
  });

  it('shows no line by default', () => {
    const out = document.createElement('p');
    out.id = 'openworld-tally';
    out.textContent = 'old';
    document.body.append(out);
    setup().m.enter(7, 800, 600);
    expect(out.textContent).toBe('');
    out.remove();
  });
});

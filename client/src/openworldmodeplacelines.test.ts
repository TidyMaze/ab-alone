// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import type { Axial } from './board';
import { CHUNK } from './openworld';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import type { PlaceLineKind } from './placelines';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// Tally files the first town, gate, tower or remembered biome the hero reaches (#1315, docs/specs/openworld.md section 7).
// Open ground in the chunks -3..3, of the biome given (0 the meadow, 2 the tundra).
const ground = (biome: number) => (_seed: number, cx: number, cy: number): Uint8Array => {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, biome], i * 3);
  return out;
};
// `kind, q, r` triples: a dungeon gate and a town, away from the spawn; a tower `q, r` pair.
const PLACES = Int32Array.of(1, 0, 10, 0, 10, 0);
const LAIRS = Int32Array.of(-10, 0);
const none = (n: number): undefined[] => Array.from({ length: n }, () => undefined);
const make = (placeLine: (kinds: readonly PlaceLineKind[]) => string, biome = 0) =>
  new (OpenWorldMode as new (...args: unknown[]) => OpenWorldMode)(
    ground(biome), () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1),
    () => LAIRS, ...none(12), () => PLACES, ...none(5), placeLine,
  );
const roll = (m: OpenWorldMode, to: Axial): boolean => (m as unknown as { roll(to: Axial): boolean }).roll(to);
const tally = () => document.getElementById('openworld-tally')!.textContent;

afterEach(() => {
  document.body.innerHTML = '';
  for (const key of Object.keys(document.body.dataset)) delete document.body.dataset[key];
});

describe("Tally's place lines in the Open world mode (#1315)", () => {
  it('asks for the line of the places reached after each step, and shows it in place of the HUD line', () => {
    document.body.innerHTML = '<p id="openworld-tally"></p>';
    const placeLine = vi.fn((kinds: readonly PlaceLineKind[]) => kinds.join(','));
    const m = make(placeLine);
    m.enter(7, 800, 600);
    m.fixture({ hero: [6, 0], troop: [], enemies: [] });
    roll(m, [7, 0]);
    expect(placeLine).toHaveBeenLastCalledWith(['town']);
    expect(tally()).toBe('town');
    m.fixture({ hero: [-6, 0], troop: [], enemies: [] });
    roll(m, [-7, 0]);
    expect(tally()).toBe('tower');
    m.fixture({ hero: [0, 6], troop: [], enemies: [] });
    roll(m, [0, 7]);
    expect(placeLine).toHaveBeenLastCalledWith(['gate']);
  });

  it('names the biome stood in, and leaves the HUD line alone when there is nothing new to say', () => {
    document.body.innerHTML = '<p id="openworld-tally">kept</p>';
    const placeLine = vi.fn((kinds: readonly PlaceLineKind[]) => (kinds.includes('tundra') ? '' : 'never'));
    const m = make(placeLine, 2);
    m.enter(7, 800, 600);
    document.getElementById('openworld-tally')!.textContent = 'kept';
    roll(m, [1, 0]);
    expect(placeLine).toHaveBeenLastCalledWith(['tundra']);
    expect(tally()).toBe('kept');
  });

  it('steps on without a HUD line on the page', () => {
    const m = make(() => 'a line');
    m.enter(7, 800, 600);
    expect(roll(m, [1, 0])).toBe(true);
  });
});

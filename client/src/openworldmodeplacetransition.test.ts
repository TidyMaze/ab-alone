// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { CHUNK } from './openworld';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The transition of a tower, a dungeon gate and a town (#1519, docs/specs/motion.md story 10): started in the same step as the place, never in its way.
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}
const LAIRS = Int32Array.of(3, 0, -4, 2);
const PLACES = Int32Array.of(0, 0, 0, 1, 6, 0, 0, 60, 0); // the spawn town, a gate at (6, 0), a far town
const IDS = ['echo', 'ballast'];
const NAMES: Record<string, string> = { echo: 'The Echo', ballast: 'The Ballast Mind' };
const make = (reduced: boolean, onLair = vi.fn(), onPlace = vi.fn()) => {
  const m = new OpenWorldMode(
    grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => reduced, worldSaves(memoryStore(), 1), () => LAIRS, onLair,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => IDS, undefined, undefined, () => PLACES, onPlace,
    undefined, undefined, undefined, (id: string) => NAMES[id]!,
  );
  return { m, onLair, onPlace };
};
const body = () => document.body.dataset;
const root = () => document.getElementById('place-transition')!;
const title = () => root().querySelector('.pt-title')!.textContent;
const walk = (m: OpenWorldMode, from: [number, number], key: string) => {
  m.enter(7, 800, 600);
  m.fixture({ hero: from, troop: [], enemies: [] });
  m.key(key);
  m.release(key);
};

afterEach(() => {
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('entering a place starts the transition without holding the place back (#1519)', () => {
  it('a tower starts its fight in the same step, with the boss name and its own cue', () => {
    const { m, onLair } = make(false);
    walk(m, [2, 0], 'ArrowRight');
    expect(onLair).toHaveBeenCalledWith(7, 0, [], []);
    expect(m.active).toBe(false);
    expect(root().dataset.kind).toBe('tower');
    expect(title()).toBe('The Echo');
    expect(body().placeTransition).toBe('enter');
  });

  it('names the second tower by its own boss', () => {
    const { m } = make(false);
    walk(m, [-4, 3], 'ArrowLeft');
    expect(title()).toBe('The Ballast Mind');
  });

  it('a dungeon gate shows the run and its cue', () => {
    const gate = make(false);
    walk(gate.m, [5, 0], 'ArrowRight');
    expect(gate.onPlace).toHaveBeenCalledWith(7, 'dungeon', 0, expect.any(String), '');
    expect(root().dataset.kind).toBe('dungeon');
    expect(title()).toBe('Mining cut · Rogue-lite run');
  });

  it('a town shows the Hub and no cue of its own', () => {
    const town = make(false);
    town.m.enter(7, 800, 600);
    town.m.fixture({ hero: [-1, 0], troop: [], enemies: [] });
    town.m.key('ArrowRight');
    town.m.release('ArrowRight');
    expect(town.onPlace).toHaveBeenCalledWith(7, 'town', 0, expect.any(String), 'Contract: The Echo, ring 1, 3 cells, to the upper right.'); // the camera's yaw turns the bearing as the minimap does
    expect(root().dataset.kind).toBe('town');
    expect(title()).toBe('Muster point · the Hub');
  });

  it('shows the title and no motion under reduced motion', () => {
    const { m } = make(true);
    walk(m, [2, 0], 'ArrowRight');
    expect(root().dataset.motion).toBe('cut');
    expect(title()).toBe('The Echo');
  });

  it("titles a tower of a mode that was not told the names with the ship's door, never an empty plate (#1547)", () => {
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => false, worldSaves(memoryStore(), 1), () => LAIRS);
    walk(m, [2, 0], 'ArrowRight');
    expect(title()).toBe("Ship's door");
  });

  it("titles a tower of a mode told the bosses and not their names with the ship's door (#1547)", () => {
    const gap: undefined[] = Array.from({ length: 9 }, () => undefined); // onLair to teleportersOf
    const m = new (OpenWorldMode as new (...args: unknown[]) => OpenWorldMode)(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => false, worldSaves(memoryStore(), 1), () => LAIRS, ...gap, () => IDS);
    walk(m, [2, 0], 'ArrowRight');
    expect(title()).toBe("Ship's door");
  });
});

describe('coming back to the world plays the matching return (#1519)', () => {
  it('opens the world with the cue of the place it comes from, and none when it comes from nowhere', async () => {
    const { m } = make(false);
    await m.open(7, 800, 600);
    expect(document.getElementById('place-transition')).toBeNull();
    m.leave();
    await m.open(7, 800, 600, true, 'tower');
    expect(root().dataset.kind).toBe('tower');
    expect(body().placeTransition).toBe('back');
    expect(title()).toBe('');
  });

  it('shows no return under reduced motion', async () => {
    const { m } = make(true);
    await m.open(7, 800, 600, true, 'dungeon');
    expect(document.getElementById('place-transition')).toBeNull();
  });
});

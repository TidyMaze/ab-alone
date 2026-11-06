// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import type { Axial } from './board';
import { CHUNK } from './openworld';
import { ICON } from './openworldlairicon';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The towns and dungeon gates of the Open world mode (#1514, docs/specs/openworld.md section 13). Open grass in the chunks -3..3.
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}
// `kind, q, r` triples: the spawn town, a dungeon gate in the window, a town far away.
const PLACES = Int32Array.of(0, 0, 0, 1, 6, 0, 0, 60, 0);
const none: undefined[] = Array.from({ length: 12 }, () => undefined); // the parameters before `read`
const make = (placesOf?: (seed: number) => Int32Array, onPlace?: (seed: number, kind: 'town' | 'dungeon', index: number, biome: string) => void, saves = worldSaves(memoryStore(), 1), chunk = grass) =>
  new (OpenWorldMode as new (...args: unknown[]) => OpenWorldMode)(chunk, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, ...none, undefined, placesOf, onPlace);
const body = () => document.body.dataset;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the towns and dungeon gates of the Open world mode (#1514)', () => {
  it('reads the places of the seed and publishes them all, kind and cell, a landmark seen from afar', () => {
    const placesOf = vi.fn(() => PLACES);
    const m = make(placesOf);
    m.enter(7, 800, 600);
    expect(placesOf).toHaveBeenCalledWith(7);
    expect(body().openworldPlaces).toBe('town:0,0 dungeon:6,0 town:60,0');
    m.leave();
    expect(body().openworldPlaces).toBeUndefined();
  });

  it('publishes none for a world given no place', () => {
    make().enter(7, 800, 600);
    expect(body().openworldPlaces).toBe('');
  });

  it('draws the town and the gate in the minimap window as their icons', () => {
    const fills: string[] = [];
    const blank = () => {};
    const ctx = { fillStyle: '', clearRect: blank, save: blank, restore: blank, fillText: blank, beginPath: blank, arc: blank, moveTo: blank, lineTo: blank, closePath: blank, clip: blank, stroke: blank, fill() { fills.push(ctx.fillStyle); }, fillRect: blank };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    make(() => PLACES).enter(7, 800, 600);
    expect(fills.filter((c) => c === ICON.town)).toHaveLength(1); // the far town is out of the window
    expect(fills.filter((c) => c === ICON.dungeon)).toHaveLength(1);
  });
});

// Rolling onto a town or a gate from a neighbour enters it, as a lair starts its fight (#1593, docs/specs/openworld.md section 13).
describe('entering a town or a dungeon gate (#1593)', () => {
  const roll = (m: OpenWorldMode, key: string): void => {
    m.key(key);
    m.release(key);
  };

  it('rolling onto a dungeon gate from its neighbour starts the gate: the mode is left, the hero stays on the entrance and the save keeps it', async () => {
    const saves = worldSaves(memoryStore(), 1);
    const onPlace = vi.fn();
    const m = make(() => PLACES, onPlace, saves);
    m.enter(7, 800, 600);
    m.fixture({ hero: [5, 0], troop: [[4, 0]], enemies: [] });
    roll(m, 'ArrowRight');
    expect(onPlace).toHaveBeenCalledWith(7, 'dungeon', 0, 'meadow');
    expect(m.active).toBe(false);
    for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.hero).toEqual([5, 0]);
  });

  it('tells the page the biome of the gate\'s ground, so its run begins there, #1597', () => {
    const desert = (seed: number, cx: number, cy: number): Uint8Array => {
      const out = grass(seed, cx, cy);
      for (let i = 2; i < out.length; i += 3) out[i] = 3; // the biome byte of every cell
      return out;
    };
    const onPlace = vi.fn();
    const m = make(() => PLACES, onPlace, worldSaves(memoryStore(), 1), desert);
    m.enter(7, 800, 600);
    m.fixture({ hero: [5, 0], troop: [[4, 0]], enemies: [] });
    roll(m, 'ArrowRight');
    expect(onPlace).toHaveBeenCalledWith(7, 'dungeon', 0, 'desert');
  });

  it('rolling back onto the spawn town starts the town, the hero having started on it did not', () => {
    const onPlace = vi.fn();
    const m = make(() => PLACES, onPlace);
    m.enter(7, 800, 600);
    expect(onPlace).not.toHaveBeenCalled(); // the hero spawns on the town of (0, 0)
    expect(m.active).toBe(true);
    m.fixture({ hero: [-1, 0], troop: [], enemies: [] });
    roll(m, 'ArrowRight');
    expect(onPlace).toHaveBeenCalledWith(7, 'town', 0, 'meadow');
    expect(m.active).toBe(false);
  });

  it('tells the index of the place among those of its kind, so the second town is 1 (#1516)', () => {
    const onPlace = vi.fn();
    const m = make(() => PLACES, onPlace);
    m.enter(7, 800, 600);
    m.fixture({ hero: [59, 0], troop: [], enemies: [] });
    roll(m, 'ArrowRight');
    expect(onPlace).toHaveBeenCalledWith(7, 'town', 1, 'meadow');
  });

  it('ignores a press on a place the hero is not next to, and leaves the world on one even when nothing is listening', () => {
    const onPlace = vi.fn();
    const m = make(() => PLACES, onPlace);
    m.enter(7, 800, 600);
    (m as unknown as { roll(to: Axial): void }).roll([6, 0]);
    expect(onPlace).not.toHaveBeenCalled();
    expect(m.active).toBe(true);
    const quiet = make(() => PLACES);
    quiet.enter(7, 800, 600);
    quiet.fixture({ hero: [5, 0], troop: [], enemies: [] });
    roll(quiet, 'ArrowRight');
    expect(quiet.active).toBe(false);
  });

  it('walks round a place: the walk to a far cell and the Dungeon button ask for the way with the places as blocked cells', () => {
    const path = vi.fn(() => new Int32Array());
    const dungeon = vi.fn(() => new Int32Array());
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), () => Int32Array.of(9, 9), undefined, undefined, undefined, undefined, path, undefined, undefined, dungeon, undefined, undefined, undefined, undefined, () => PLACES);
    m.enter(7, 800, 600);
    (m as unknown as { walkTo(to: Axial): void }).walkTo([12, 0]);
    expect(path).toHaveBeenCalledWith(7, [0, 0], [12, 0], Int32Array.of(9, 9, 0, 0, 6, 0, 60, 0), new Int32Array());
    m.dungeon();
    expect(dungeon).toHaveBeenCalledWith(7, [0, 0], new Int32Array(), Int32Array.of(9, 9, 0, 0, 6, 0, 60, 0), new Int32Array());
  });

  it('keeps the troop off a place when it arrives on a teleporter: no marble stands on one', () => {
    const m = make(() => PLACES);
    m.enter(7, 800, 600);
    const free = (m as unknown as { free(cell: Axial): boolean }).free;
    expect(free([6, 0])).toBe(false);
    expect(free([7, 0])).toBe(true);
  });
});

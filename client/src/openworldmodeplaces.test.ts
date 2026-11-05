// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
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
const none = Array.from({ length: 12 }, () => undefined) as [];
const make = (placesOf?: (seed: number) => Int32Array) =>
  new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), ...none, ...(placesOf ? [undefined, placesOf] : []));
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

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { dailyRun, loadRun, MAP_VERSION, newRun, saveRun, type MapNode } from './roguelite';
import { memoryStore } from './savegame';
import rust from '../../crates/edgefall-core/src/run.rs?raw';

const MAP: MapNode[] = [{ act: 0, row: 0, col: 0, kind: 'boss', links: [], skips: [], formation: 0, elite: 0 }];

describe('the version of the map of a run (#1543)', () => {
  it('is the version of the engine, a new run takes the one it is given and the daily run the current one', () => {
    expect(MAP_VERSION).toBe(Number(/pub const MAP_VERSION: u8 = (\d+);/.exec(rust)![1]));
    expect(newRun(5, 3, []).map).toBe(0); // the map of before the pacing unless the page asks for the new one
    expect(newRun(5, 3, [], 0, 0, MAP_VERSION).map).toBe(MAP_VERSION);
    expect(dailyRun('2026-11-01', 5).map).toBe(MAP_VERSION);
  });

  it('is saved with the run, and the map of a run is asked with it', async () => {
    const store = memoryStore();
    const run = { ...newRun(5, 3, [], 0, 3, MAP_VERSION), path: [0] };
    await saveRun(store, run);
    const asked: number[][] = [];
    const loaded = await loadRun(store, (seed, runes, version) => (asked.push([seed, runes, version]), MAP), () => null as never);
    expect(loaded!.state).toEqual(run);
    expect(asked).toEqual([[5, 3, MAP_VERSION]]);
  });

  it('is 0 for a run saved before the pacing, which keeps the map it was dealt', async () => {
    const store = memoryStore();
    const { map: _map, ...old } = { ...newRun(5, 3, []), path: [0] };
    await store.put('run', old);
    const asked: number[] = [];
    const loaded = await loadRun(store, (_seed, _runes, version) => (asked.push(version), MAP), () => null as never);
    expect(loaded!.state.map).toBe(0);
    expect(asked).toEqual([0]);
  });

  it('is refused when it is no version the engine knows', async () => {
    for (const bad of [MAP_VERSION + 1, -1, 0.5, '1', null]) {
      const store = memoryStore();
      await store.put('run', { ...newRun(5, 3, []), path: [0], map: bad });
      expect(await loadRun(store, () => MAP, () => null as never)).toBeNull();
    }
  });
});

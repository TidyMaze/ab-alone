// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { world_chunk } from 'abalone-wasm';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';

// #1104: each biome of the Open world drifts its own particles (pollen, leaves, snow, dust) and the desert shimmers. Seed 1 has a
// cell of each (found with `world_chunk`). The page marks what is drawn on a webdriver page. This was an e2e spec
// (e2e/openworld-ambience.spec.ts): a frame cost seconds on the CI runner, and the mode draws the same on the real world here.
const CELL = { forest: [29, -59], tundra: [-19, -44], desert: [-60, 30], meadow: [40, -20] } as const; // one a sextant (#1442)
const body = () => document.body.dataset;
const mode = () => new OpenWorldMode(world_chunk, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => false, worldSaves(memoryStore(), 1));
const stand = (m: OpenWorldMode, cell: readonly [number, number], at: number): void => {
  m.fixture({ hero: [...cell], troop: [], enemies: [] });
  m.frame(vi.fn(), at);
  m.frame(vi.fn(), at + 16);
};

afterEach(() => {
  delete document.body.dataset.tier;
  delete (navigator as { webdriver?: boolean }).webdriver;
});

describe('the ambience of the biomes of the Open world (#1104)', () => {
  it('each biome drifts its own particles and the desert shimmers', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    const m = mode();
    m.enter(1, 480, 270);
    let at = 1000;
    for (const biome of ['forest', 'tundra', 'desert', 'meadow'] as const) {
      stand(m, CELL[biome], (at += 1000));
      expect(Number(body().openworldParticles), biome).toBeGreaterThan(2);
      expect(Number(body().openworldParticles), biome).toBeLessThanOrEqual(64);
      if (biome === 'desert') expect(body().openworldMotion).toContain('shimmer');
      else expect(body().openworldMotion ?? '').not.toContain('shimmer'); // the shimmer clears a frame after the hero leaves the desert
    }
  });

  it('nothing drifts or shimmers on the low tier', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    document.body.dataset.tier = 'low';
    const m = mode();
    m.enter(1, 480, 270);
    stand(m, CELL.forest, 2000);
    expect(Number(body().openworldParticles ?? 0)).toBe(0);
    stand(m, CELL.desert, 4000);
    expect(body().openworldMotion ?? '').toBe('');
  });
});

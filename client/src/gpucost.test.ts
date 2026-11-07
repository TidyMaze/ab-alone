import { describe, expect, it } from 'vitest';
import { GPU_WINDOW, GpuCost, gpuStatsOn, gpuSummary, modeOfScene } from './gpucost';

describe('gpuStatsOn', () => {
  it('is on only with the ?gpustats flag', () => {
    expect(gpuStatsOn('?gpustats')).toBe(true);
    expect(gpuStatsOn('?x=1&gpustats')).toBe(true);
    expect(gpuStatsOn('')).toBe(false);
    expect(gpuStatsOn('?fps=on')).toBe(false);
  });
});

describe('modeOfScene', () => {
  it('keeps the scene family, not the boss or the biome', () => {
    expect(modeOfScene('hub')).toBe('hub');
    expect(modeOfScene('boss:echo')).toBe('boss');
    expect(modeOfScene('world:dunes:day')).toBe('world');
  });
});

describe('gpuSummary', () => {
  it('gives the mean, the 95th percentile and the max of the samples', () => {
    const s = gpuSummary([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.samples).toBe(10);
    expect(s.avg).toBeCloseTo(5.5);
    expect(s.p95).toBe(10);
    expect(s.max).toBe(10);
  });
  it('a single sample is its own percentile', () => {
    expect(gpuSummary([4.2])).toEqual({ samples: 1, avg: 4.2, p95: 4.2, max: 4.2 });
  });
});

describe('GpuCost', () => {
  it('keeps one window per mode and drops the oldest sample past the window', () => {
    const c = new GpuCost(true);
    for (let i = 0; i < GPU_WINDOW + 5; i++) c.record('hub', 1);
    c.record('world', 9);
    expect(c.summary('hub')?.samples).toBe(GPU_WINDOW);
    expect(c.summary('world')).toEqual({ samples: 1, avg: 9, p95: 9, max: 9 });
    expect(c.summary('boss')).toBeNull();
  });
  it('ignores samples when the backend has no timestamps, and bad values', () => {
    const off = new GpuCost(false);
    off.record('hub', 3);
    expect(off.summary('hub')).toBeNull();
    const c = new GpuCost(true);
    c.record('hub', undefined);
    c.record('hub', -1);
    c.record('hub', Number.NaN);
    expect(c.summary('hub')).toBeNull();
  });
  it('says so when the backend has no timestamp query', () => {
    expect(new GpuCost(false).text('hub')).toBe('gpu: not supported by this backend');
  });
  it('waits for the first drawn frame of a mode', () => {
    const c = new GpuCost(true);
    expect(c.text('hub')).toBe('gpu hub: waiting for a drawn frame');
  });
  it('reads the mean, p95, max and the frame count of the mode', () => {
    const c = new GpuCost(true);
    c.record('hub', 4);
    c.record('hub', 6);
    expect(c.text('hub')).toBe('gpu hub: avg 5.00 ms, p95 6.00, max 6.00 (2 frames)');
  });
  it('exposes every mode seen, for the browser checks', () => {
    const c = new GpuCost(true);
    c.record('hub', 1);
    c.record('world', 2);
    expect(c.snapshot()).toEqual({
      supported: true,
      modes: { hub: { samples: 1, avg: 1, p95: 1, max: 1 }, world: { samples: 1, avg: 2, p95: 2, max: 2 } },
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { GPU_WINDOW, GpuCost, frameSpans, gpuFrameReader, gpuMetricOf, gpuStatsOn, gpuSummary, modeOfScene, spanPool, type TimestampPool } from './gpucost';

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
    expect(c.text('hub')).toBe('gpu hub (frame span): avg 5.00 ms, p95 6.00, max 6.00 (2 frames)');
    const gl = new GpuCost(true, 'pass-sum');
    gl.record('hub', 4);
    expect(gl.text('hub')).toBe('gpu hub (pass sum): avg 4.00 ms, p95 4.00, max 4.00 (1 frames)');
  });
  it('exposes every mode seen, for the browser checks', () => {
    const c = new GpuCost(true);
    c.record('hub', 1);
    c.record('world', 2);
    expect(c.snapshot()).toEqual({
      supported: true,
      metric: 'frame-span',
      modes: { hub: { samples: 1, avg: 1, p95: 1, max: 1 }, world: { samples: 1, avg: 2, p95: 2, max: 2 } },
    });
  });
});

// Timestamps in ns, as the WebGPU query set holds them: a pass at offset o starts at times[o] and ends at times[o + 1].
const ns = (ms: number): bigint => BigInt(Math.round(ms * 1e6));

describe('frameSpans', () => {
  it('spans each frame from its first pass start to its last pass end, not the sum of its overlapping passes', () => {
    // frame 7: shadow 0-3 ms, main 1-4 ms (overlapping), post 4-5 ms: the sum reads 7 ms, the frame takes 5
    const offsets = new Map([['main:f7', 2], ['shadow:f7', 0], ['post:f7', 4], ['main:f8', 6]]);
    const times = [ns(100), ns(103), ns(101), ns(104), ns(104), ns(105), ns(110), ns(112.5)];
    expect(frameSpans(offsets, times)).toEqual([5, 2.5]);
  });
  it('counts no gap between two passes of a frame, and a pass inside another once', () => {
    // 10-12 ms, then 10.5-11 inside it, then 30-31 after 18 ms with nothing running: 3 ms of GPU, not a 21 ms span
    const offsets = new Map([['late:f2', 4], ['a:f2', 0], ['inner:f2', 2]]);
    expect(frameSpans(offsets, [ns(10), ns(12), ns(10.5), ns(11), ns(30), ns(31)])).toEqual([3]);
  });
  it('orders the frames by number and skips a pass never written (zero, or ending before it starts)', () => {
    const offsets = new Map([['a:f9', 0], ['b:f3', 2], ['c:f3', 4], ['d:f3', 6], ['e:f4', 8]]);
    const times = [ns(50), ns(51), ns(10), ns(12), 0n, 0n, ns(20), ns(19), 0n, ns(30)];
    expect(frameSpans(offsets, times)).toEqual([2, 1]);
  });
  it('skips a uid with no frame number', () => {
    expect(frameSpans(new Map([['compute', 0]]), [ns(1), ns(2)])).toEqual([]);
  });
});

// A WebGPU pool as three makes it: _resolveQueries copies the query set into the result buffer and reads it mapped.
function fakePool(times: bigint[], offsets: [string, number][]): TimestampPool & { resolves: number } {
  const pool = {
    resolves: 0,
    queryOffsets: new Map(offsets),
    resultBuffer: { getMappedRange: (_offset?: number, _size?: number): ArrayBuffer => BigUint64Array.from(times).buffer },
    async _resolveQueries(): Promise<number> {
      pool.resolves++;
      pool.queryOffsets.clear();
      if (times.length === 0) return 9; // three returns its last value when the buffer is busy: nothing mapped
      pool.resultBuffer.getMappedRange(0, times.length * 8);
      return 99; // three's sum of the passes
    },
  };
  return pool;
}

describe('spanPool', () => {
  it("reports the span of every frame the pool resolves and keeps three's own value", async () => {
    const pool = fakePool([ns(10), ns(13), ns(11), ns(14)], [['a:f1', 0], ['b:f1', 2]]);
    const spans: number[] = [];
    spanPool(pool, (ms) => spans.push(ms));
    expect(await pool._resolveQueries()).toBe(99);
    expect(spans).toEqual([4]);
  });
  it('reports nothing when the pool maps nothing', async () => {
    const pool = fakePool([], [['a:f1', 0]]);
    const spans: number[] = [];
    spanPool(pool, (ms) => spans.push(ms));
    expect(await pool._resolveQueries()).toBe(9);
    expect(spans).toEqual([]);
  });
});

describe('gpuFrameReader', () => {
  type Backend = { isWebGPUBackend?: boolean; timestampQueryPool?: { render?: TimestampPool | null } };
  const renderer = (backend: Backend, sum = 7) => {
    const r = {
      backend,
      calls: 0,
      async resolveTimestampsAsync(): Promise<number | undefined> {
        r.calls++;
        const pool = backend.timestampQueryPool?.render;
        return pool ? pool._resolveQueries() : sum;
      },
    };
    return r;
  };
  it('reads the frame span on WebGPU, hooking the render pool once', async () => {
    const pool = fakePool([ns(10), ns(12), ns(11), ns(13)], [['a:f1', 0], ['b:f1', 2]]);
    const backend: Backend = { isWebGPUBackend: true };
    const r = renderer(backend);
    const gpu = new GpuCost(true);
    const read = gpuFrameReader(r, gpu);
    read('bot'); // no pass timed yet: no pool, nothing to read
    backend.timestampQueryPool = {};
    read('bot');
    expect(r.calls).toBe(0);
    backend.timestampQueryPool.render = pool;
    read('bot');
    await vi.waitFor(() => expect(gpu.summary('bot')?.avg).toBe(3));
    pool.queryOffsets.set('a:f2', 0);
    read('boss');
    await vi.waitFor(() => expect(gpu.summary('boss')?.samples).toBe(1));
    expect(pool.resolves).toBe(2); // hooked once: one span a resolve, not two
    expect(gpu.summary('bot')?.samples).toBe(1);
  });
  it("keeps three's pass sum on WebGL, whose timer queries never overlap", async () => {
    const gpu = new GpuCost(true, 'pass-sum');
    gpuFrameReader(renderer({}, 4.5), gpu)('hub');
    await vi.waitFor(() => expect(gpu.summary('hub')?.avg).toBe(4.5));
  });
  it('names the metric of the backend', () => {
    expect(gpuMetricOf({ isWebGPUBackend: true })).toBe('frame-span');
    expect(gpuMetricOf({})).toBe('pass-sum');
  });
  it('reads nothing when the backend has no timestamp query', () => {
    const r = renderer({});
    gpuFrameReader(r, new GpuCost(false))('hub');
    expect(r.calls).toBe(0);
  });
});

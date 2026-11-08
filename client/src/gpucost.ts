// The GPU frame cost readout (#1581), dev only: `?gpustats` in the page address. Three's timestamp queries (WebGPU
// timestamp-query, or EXT_disjoint_timer_query_webgl2 on WebGL) give the GPU time of each drawn frame, kept in a window
// per mode (the scene family: hub, run, boss, world...). Off for players: nothing is recorded without the flag.
// On WebGPU the frame's time is its passes merged on the GPU timeline, first pass start to last pass end without the gaps
// between submits (#1645): three's own number sums each pass's begin-to-end span, which overlap on the Apple GPU (23 ms read
// for 2 ms of work, #1641); a raw span would count the idle gaps (a 144 ms frame seen on the board).
// On WebGL three's sum stays: its TIME_ELAPSED queries run one at a time, so its passes never overlap.

/** How a frame's GPU time is read: its span (WebGPU timestamps) or the sum of its passes (WebGL timer queries). */
export type GpuMetric = 'frame-span' | 'pass-sum';

/** The drawn frames kept per mode. */
export const GPU_WINDOW = 300;

/** True when the page asks for the readout with `?gpustats`. */
export const gpuStatsOn = (search: string): boolean => new URLSearchParams(search).has('gpustats');

/** The scene family of a scene id: `boss:echo` is `boss`, `world:dunes:day` is `world`. */
export const modeOfScene = (scene: string): string => scene.split(':')[0]!;

export interface GpuSummary {
  samples: number;
  avg: number;
  p95: number;
  max: number;
}

/** The mean, the 95th percentile (nearest rank) and the max of the samples, in ms. */
export function gpuSummary(samples: readonly number[]): GpuSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return { samples: n, avg: sum / n, p95: sorted[Math.ceil(0.95 * n) - 1]!, max: sorted[n - 1]! };
}

/** The GPU times of the drawn frames, per mode. `supported` is false when the backend has no timestamp query. */
export class GpuCost {
  private readonly windows = new Map<string, number[]>();

  constructor(
    readonly supported: boolean,
    readonly metric: GpuMetric = 'frame-span',
  ) {}

  /** Keeps one GPU time (ms) of a drawn frame. A missing or bad value is dropped. */
  record(mode: string, ms: number | undefined): void {
    if (!this.supported || ms === undefined || !(ms >= 0)) return;
    const window = this.windows.get(mode) ?? [];
    window.push(ms);
    if (window.length > GPU_WINDOW) window.shift();
    this.windows.set(mode, window);
  }

  summary(mode: string): GpuSummary | null {
    const window = this.windows.get(mode);
    return window && window.length > 0 ? gpuSummary(window) : null;
  }

  /** One line for the readout of a mode. */
  text(mode: string): string {
    if (!this.supported) return 'gpu: not supported by this backend';
    const s = this.summary(mode);
    if (s === null) return `gpu ${mode}: waiting for a drawn frame`;
    const how = this.metric === 'frame-span' ? 'frame span' : 'pass sum';
    return `gpu ${mode} (${how}): avg ${s.avg.toFixed(2)} ms, p95 ${s.p95.toFixed(2)}, max ${s.max.toFixed(2)} (${s.samples} frames)`;
  }

  /** Every mode seen, for the browser checks. */
  snapshot(): { supported: boolean; metric: GpuMetric; modes: Record<string, GpuSummary> } {
    const modes: Record<string, GpuSummary> = {};
    for (const mode of this.windows.keys()) modes[mode] = this.summary(mode)!;
    return { supported: this.supported, metric: this.metric, modes };
  }
}

/** The length of the union of the [start, end] spans (ns), in ms: overlaps count once, the gaps between them not at all. */
function unionMs(spans: [bigint, bigint][]): number {
  spans.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let total = 0n;
  let [from, to] = spans[0]!;
  for (const [start, end] of spans.slice(1)) {
    if (start > to) {
      total += to - from;
      from = start;
    }
    if (end > to) to = end;
  }
  return Number(total + to - from) / 1e6;
}

/**
 * The GPU time of each frame of a resolved batch, in ms, by frame number: its passes laid on the GPU timeline, from the
 * first pass start to the last pass end, where passes that overlap count once and a gap with no pass running (the GPU
 * waiting for the next submit) does not count. `offsets` maps three's pass uid (`<context>:f<frame>`) to its query pair
 * in `times` (ns). A pass never written (a zero start, or an end before its start) is skipped.
 */
export function frameSpans(offsets: ReadonlyMap<string, number>, times: ArrayLike<bigint>): number[] {
  const frames = new Map<number, [bigint, bigint][]>();
  for (const [uid, at] of offsets) {
    const frame = /:f(\d+)$/.exec(uid);
    const start = times[at]!;
    const end = times[at + 1]!;
    if (!frame || start === 0n || end < start) continue;
    const n = Number(frame[1]);
    frames.set(n, [...(frames.get(n) ?? []), [start, end]]);
  }
  return [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([, spans]) => unionMs(spans));
}

/** The parts of three's WebGPUTimestampQueryPool (0.186) the span reads. */
export interface TimestampPool {
  queryOffsets: Map<string, number>;
  resultBuffer: { getMappedRange(offset?: number, size?: number): ArrayBuffer };
  _resolveQueries(): Promise<number>;
}

/**
 * Makes a WebGPU pool hand each frame span it resolves to `onSpan`: the pass offsets are read before three clears them,
 * the timestamps copied when three maps them. Three's own value is returned unchanged. Dev only (`?gpustats`).
 */
export function spanPool(pool: TimestampPool, onSpan: (ms: number) => void): void {
  const resolve = pool._resolveQueries.bind(pool);
  const buffer = pool.resultBuffer;
  const mapped = buffer.getMappedRange.bind(buffer);
  let times: BigUint64Array | null = null;
  buffer.getMappedRange = (offset, size) => {
    const range = mapped(offset, size);
    times = new BigUint64Array(range.slice(0));
    return range;
  };
  pool._resolveQueries = async () => {
    const offsets = new Map(pool.queryOffsets);
    times = null;
    const value = await resolve();
    if (times) for (const ms of frameSpans(offsets, times)) onSpan(ms);
    return value;
  };
}

/** The renderer parts the reader uses. */
export interface TimedRenderer {
  backend: { isWebGPUBackend?: boolean; timestampQueryPool?: { render?: TimestampPool | null } };
  resolveTimestampsAsync(type: 'render'): Promise<number | undefined>;
}

/** The metric a backend gives: the frame span on WebGPU, the pass sum on WebGL. */
export const gpuMetricOf = (backend: TimedRenderer['backend']): GpuMetric => (backend.isWebGPUBackend ? 'frame-span' : 'pass-sum');

/**
 * Reads the GPU time of the frame just drawn into `gpu`, under `mode`: the frame span on WebGPU (the render pool is
 * hooked once, when three has made it), three's pass sum on WebGL. Nothing is read when the backend has no timestamp query.
 */
export function gpuFrameReader(renderer: TimedRenderer, gpu: GpuCost): (mode: string) => void {
  let hooked: TimestampPool | null = null;
  let current = '';
  return (mode) => {
    if (!gpu.supported) return;
    if (!renderer.backend.isWebGPUBackend) {
      void renderer.resolveTimestampsAsync('render').then((ms) => gpu.record(mode, ms));
      return;
    }
    const pool = renderer.backend.timestampQueryPool?.render;
    if (!pool) return;
    current = mode;
    if (pool !== hooked) {
      spanPool(pool, (ms) => gpu.record(current, ms));
      hooked = pool;
    }
    void renderer.resolveTimestampsAsync('render');
  };
}

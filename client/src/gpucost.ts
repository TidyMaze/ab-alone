// The GPU frame cost readout (#1581), dev only: `?gpustats` in the page address. Three's timestamp queries (WebGPU
// timestamp-query, or EXT_disjoint_timer_query_webgl2 on WebGL) give the GPU time of each drawn frame, kept in a window
// per mode (the scene family: hub, run, boss, world...). Off for players: nothing is recorded without the flag.

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

  constructor(readonly supported: boolean) {}

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
    return `gpu ${mode}: avg ${s.avg.toFixed(2)} ms, p95 ${s.p95.toFixed(2)}, max ${s.max.toFixed(2)} (${s.samples} frames)`;
  }

  /** Every mode seen, for the browser checks. */
  snapshot(): { supported: boolean; modes: Record<string, GpuSummary> } {
    const modes: Record<string, GpuSummary> = {};
    for (const mode of this.windows.keys()) modes[mode] = this.summary(mode)!;
    return { supported: this.supported, modes };
  }
}

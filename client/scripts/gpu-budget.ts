import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GpuMetric, GpuSummary } from '../src/gpucost';

// Checks a `?gpustats` capture against the GPU budget per mode of docs/specs/tech.md section 5.6 (#1581), a dev tool.
// Capture: open the game with `?gpustats`, play each mode a few seconds, then in the console
// `copy(JSON.stringify(window.__gpuCost))` into capture.json.
// Usage: bun run scripts/gpu-budget.ts capture.json [tech.md]. Exit 1 names each mode over its budget.

export interface ModeBudget {
  avg: number;
  p95: number;
}

export interface GpuCapture {
  supported: boolean;
  /** The frame span since #1645; a capture of three's pass sum (WebGL, or an older `?gpustats`) is not checked. */
  metric?: GpuMetric;
  modes: Record<string, GpuSummary>;
}

const HEADING = 'GPU budget per mode';
const TECH_MD = fileURLToPath(new URL('../../docs/specs/tech.md', import.meta.url));

/** The rows of the first table under the "GPU budget per mode" heading: mode, average budget, p95 budget (ms). */
export function parseGpuBudget(markdown: string): Record<string, ModeBudget> {
  const lines = [...markdown.split('\n'), '']; // a table at the end of the file ends too
  const start = lines.findIndex((l) => l.startsWith('#') && l.includes(HEADING));
  if (start < 0) throw new Error(`no "${HEADING}" table`);
  const from = lines.findIndex((l, i) => i > start && l.startsWith('|'));
  const end = lines.findIndex((l, i) => i > from && !l.startsWith('|'));
  const budget: Record<string, ModeBudget> = {};
  for (const row of lines.slice(from + 2, end)) {
    const [mode, avg, p95] = row.split('|').slice(1).map((c) => c.trim());
    if (!(Number(avg) > 0 && Number(p95) > 0)) throw new Error(`bad budget row: ${row}`);
    budget[mode!] = { avg: Number(avg), p95: Number(p95) };
  }
  return budget;
}

/** One line per mode of the capture over its average or its p95 budget, or with no row. A mode not captured is not checked. */
export function checkGpuBudget(capture: GpuCapture, budget: Record<string, ModeBudget>): string[] {
  if (!capture.supported) return ['the capture has no GPU time: the backend has no timestamp query'];
  if (capture.metric !== 'frame-span') return [`the capture is not a frame span (metric ${capture.metric ?? 'missing'}): the budgets are WebGPU frame spans`];
  const failures: string[] = [];
  for (const [mode, s] of Object.entries(capture.modes)) {
    const b = budget[mode];
    if (!b) failures.push(`${mode}: no budget row in docs/specs/tech.md`);
    else if (s.avg > b.avg) failures.push(`${mode}: avg ${s.avg.toFixed(2)} ms over its ${b.avg} ms budget`);
    else if (s.p95 > b.p95) failures.push(`${mode}: p95 ${s.p95.toFixed(2)} ms over its ${b.p95} ms budget`);
  }
  return failures;
}

/** The script: prints OK or each failure, returns the exit code. */
export function main(captureFile: string, techMd = TECH_MD): number {
  const capture = JSON.parse(readFileSync(captureFile, 'utf8')) as GpuCapture;
  const failures = checkGpuBudget(capture, parseGpuBudget(readFileSync(techMd, 'utf8')));
  if (failures.length === 0) console.log(`gpu budget: OK, ${Object.keys(capture.modes).length} mode(s) checked`);
  for (const f of failures) console.log(`gpu budget: ${f}`);
  return failures.length === 0 ? 0 : 1;
}

// Run as a script: the same check as slowest-tests.ts, which a test can make true.
if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv[2]!, process.argv[3]));

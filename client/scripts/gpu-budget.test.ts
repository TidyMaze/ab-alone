import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkGpuBudget, main, parseGpuBudget } from './gpu-budget';

const doc = [
  '### 5.5 Performance budget',
  '',
  '| Not | the | table |',
  '|---|---|---|',
  '',
  '### 5.6 GPU budget per mode (#1581)',
  '',
  'Some text.',
  '',
  '| Mode | Avg budget (ms) | p95 budget (ms) | Measured |',
  '|---|---|---|---|',
  '| bot | 10 | 14 | 8 / 11 |',
  '| world | 9.5 | 12 | 7 / 9 |',
  '',
  '| after | the | table |',
].join('\n');

describe('parseGpuBudget', () => {
  it('reads the rows of the table under the GPU budget heading, and nothing after it', () => {
    expect(parseGpuBudget(doc)).toEqual({ bot: { avg: 10, p95: 14 }, world: { avg: 9.5, p95: 12 } });
  });

  it('fails without the heading', () => {
    expect(() => parseGpuBudget('# nothing')).toThrow('no "GPU budget per mode" table');
  });

  it('fails on a row whose budget is not a number', () => {
    expect(() => parseGpuBudget(doc.replace('| 9.5 |', '| soon |'))).toThrow('bad budget row: | world | soon | 12 | 7 / 9 |');
  });

  it('reads the table of docs/specs/tech.md, a row per mode', () => {
    const budget = parseGpuBudget(readFileSync(fileURLToPath(new URL('../../docs/specs/tech.md', import.meta.url)), 'utf8'));
    expect(Object.keys(budget).sort()).toEqual(['boss', 'bot', 'hub', 'royale', 'run-fight', 'run-map', 'world']);
  });
});

describe('checkGpuBudget', () => {
  const budget = { bot: { avg: 10, p95: 14 }, world: { avg: 9.5, p95: 12 } };
  const s = (avg: number, p95: number) => ({ samples: 300, avg, p95, max: p95 + 1 });

  it('passes a capture under every budget, and skips a mode not captured', () => {
    expect(checkGpuBudget({ supported: true, metric: 'frame-span', modes: { bot: s(9, 14) } }, budget)).toEqual([]);
  });

  it('names a mode over its average or its p95 budget', () => {
    expect(checkGpuBudget({ supported: true, metric: 'frame-span', modes: { bot: s(10.5, 13), world: s(9, 12.25) } }, budget)).toEqual([
      'bot: avg 10.50 ms over its 10 ms budget',
      'world: p95 12.25 ms over its 12 ms budget',
    ]);
  });

  it('names a captured mode the table has no row for', () => {
    expect(checkGpuBudget({ supported: true, metric: 'frame-span', modes: { hub: s(1, 1) } }, budget)).toEqual(['hub: no budget row in docs/specs/tech.md']);
  });

  it('fails a capture of another metric than the frame span the table holds (#1645)', () => {
    expect(checkGpuBudget({ supported: true, metric: 'pass-sum', modes: { bot: s(1, 1) } }, budget)).toEqual([
      'the capture is not a frame span (metric pass-sum): the budgets are WebGPU frame spans',
    ]);
    expect(checkGpuBudget({ supported: true, modes: { bot: s(1, 1) } } as never, budget)).toEqual([
      'the capture is not a frame span (metric missing): the budgets are WebGPU frame spans',
    ]);
  });

  it('fails a capture without timestamp queries', () => {
    expect(checkGpuBudget({ supported: false, modes: {} }, budget)).toEqual(['the capture has no GPU time: the backend has no timestamp query']);
  });
});

describe('main', () => {
  let dir = '';
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const files = (capture: unknown) => {
    dir = mkdtempSync(join(tmpdir(), 'gpu-budget-'));
    writeFileSync(join(dir, 'tech.md'), doc);
    writeFileSync(join(dir, 'capture.json'), JSON.stringify(capture));
    return [join(dir, 'capture.json'), join(dir, 'tech.md')] as const;
  };

  it('prints OK and returns 0 when the capture fits', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(...files({ supported: true, metric: 'frame-span', modes: { bot: { samples: 300, avg: 8, p95: 11, max: 12 } } }))).toBe(0);
    expect(log).toHaveBeenCalledWith('gpu budget: OK, 1 mode(s) checked');
  });

  it('prints each failure and returns 1', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(...files({ supported: false, modes: {} }))).toBe(1);
    expect(log).toHaveBeenCalledWith('gpu budget: the capture has no GPU time: the backend has no timestamp query');
  });

  it('reads docs/specs/tech.md by default', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(files({ supported: true, metric: 'frame-span', modes: {} })[0])).toBe(0);
    expect(log).toHaveBeenCalledWith('gpu budget: OK, 0 mode(s) checked');
  });

  it('exits with the result when started as a script', async () => {
    const [capture] = files({ supported: true, metric: 'frame-span', modes: {} });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const argv = process.argv.slice();
    process.argv.splice(1, Infinity, fileURLToPath(new URL('./gpu-budget.ts', import.meta.url)), capture); // as `bun run scripts/gpu-budget.ts capture.json`
    vi.resetModules();
    try {
      await import('./gpu-budget');
    } finally {
      process.argv.splice(0, Infinity, ...argv);
    }
    expect(exit).toHaveBeenCalledWith(0);
  });
});

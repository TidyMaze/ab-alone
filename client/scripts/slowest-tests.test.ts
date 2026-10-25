import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, slowestTests, toMarkdown } from './slowest-tests';

// Shape of Playwright's JSON reporter output, reduced to the fields the script reads.
const report = {
  suites: [
    {
      title: 'board.spec.ts',
      specs: [{ title: 'drops a marble', tests: [{ results: [{ duration: 4000 }, { duration: 1000 }] }] }],
      suites: [
        {
          title: 'eject',
          specs: [{ title: 'ejects', tests: [{ results: [{ duration: 9000 }] }] }],
          suites: [],
        },
      ],
    },
  ],
};

describe('slowestTests', () => {
  it('sorts the tests by total duration, retries included, slowest first', () => {
    expect(slowestTests(report, 10)).toEqual([
      { name: 'board.spec.ts › eject › ejects', ms: 9000 },
      { name: 'board.spec.ts › drops a marble', ms: 5000 },
    ]);
  });

  it('keeps only the n slowest tests', () => {
    expect(slowestTests(report, 1)).toEqual([{ name: 'board.spec.ts › eject › ejects', ms: 9000 }]);
  });
});

describe('toMarkdown', () => {
  it('writes a table with rank, name and duration in seconds', () => {
    expect(toMarkdown([{ name: 'a.spec.ts › x', ms: 9000 }])).toBe(
      ['| # | Test | Duration |', '|---|---|---|', '| 1 | a.spec.ts › x | 9.0 s |'].join('\n'),
    );
  });

  it('escapes pipes in test names so the table keeps its columns', () => {
    expect(toMarkdown([{ name: 'a | b', ms: 1000 }])).toContain('| 1 | a \\| b | 1.0 s |');
  });

  it('says so when no test ran', () => {
    expect(toMarkdown([])).toBe('No test result in the Playwright report.');
  });
});

describe('main', () => {
  const printed: unknown[] = [];
  afterEach(() => {
    printed.length = 0;
    vi.restoreAllMocks();
  });
  const listen = (): void => void vi.spyOn(console, 'log').mockImplementation((line) => void printed.push(line));

  it('prints the table of the report it is given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slowest-'));
    listen();
    try {
      writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
      main(join(dir, 'report.json'));
    } finally {
      rmSync(dir, { recursive: true });
    }
    expect(printed).toEqual([toMarkdown(slowestTests(report, 10))]);
  });

  it('says so and exits 0 without a report: the shard stopped before the tests ran', () => {
    listen();
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => main(join(tmpdir(), 'no-such-report.json'))).toThrow('exit 0');
    expect(printed).toEqual(['No Playwright JSON report: the shard stopped before the tests ran.']);
  });

  it('runs on e2e-results.json when started as a script with no argument', async () => {
    const read: string[] = [];
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      readFileSync: (file: string) => (read.push(file), JSON.stringify(report)),
    }));
    listen();
    const argv = process.argv.slice();
    process.argv.splice(1, Infinity, fileURLToPath(new URL('./slowest-tests.ts', import.meta.url))); // as `bun run scripts/slowest-tests.ts`
    vi.resetModules();
    try {
      await import('./slowest-tests');
    } finally {
      process.argv.splice(0, Infinity, ...argv);
      vi.doUnmock('node:fs');
    }
    expect(read).toEqual(['e2e-results.json']);
    expect(printed).toEqual([toMarkdown(slowestTests(report, 10))]);
  });
});

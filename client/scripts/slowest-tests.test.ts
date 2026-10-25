import { describe, expect, it } from 'vitest';
import { slowestTests, toMarkdown } from './slowest-tests';

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

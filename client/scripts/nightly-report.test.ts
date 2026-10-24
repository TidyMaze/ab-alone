import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FAILED_TITLE,
  FLAKY_TITLE,
  bisectHint,
  contextFrom,
  errorLines,
  issueFor,
  main,
  outcomeOf,
  summarize,
  // @ts-expect-error plain Node script, no type declarations
} from './nightly-report.mjs';

const CWD = '/runner/client';
const SHA = 'c0ffee0000000000000000000000000000000001';
const GREEN = 'beef000000000000000000000000000000000002';
const ENV = {
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'TidyMaze/ab-alone',
  GITHUB_RUN_ID: '123',
  GITHUB_SHA: SHA,
  E2E_BASE_URL: 'https://tidymaze.github.io/ab-alone/',
  E2E_GREP_INVERT: 'textures are requested',
};
const CTX = contextFrom(ENV, CWD);
const REPO = 'https://github.com/TidyMaze/ab-alone';
const RUN = `${REPO}/actions/runs/123`;

// Shapes copied from a real Playwright 1.63 JSON report (errors keep their ANSI colours, snippet and stack).
const clickTimeout = {
  message:
    "\u001b[31mError: locator.click: Test timeout of 30000ms exceeded.\u001b[39m\nCall log:\n" +
    "  - waiting for locator('#boss-list')\n\n\n  12 |\n  13 |   await page.getByRole('button').click();\n" +
    "> 14 |   await page.locator('#boss-list').click();\n     |                                    ^\n" +
    "  15 |   await expect(hud).toContainText('The Echo');\n    at /runner/client/e2e/boss.spec.ts:14:78",
  location: { file: '/runner/client/e2e/boss.spec.ts', line: 14, column: 78 },
};
const testTimeout = { message: 'Test timeout of 30000ms exceeded.' };

type Err = { message?: string; value?: string; location?: { file: string; line: number; column: number } };
type Result = { retry: number; status: string; errors: Err[]; attachments: { name: string; path: string }[] };
const result = (retry: number, status: string, errors: Err[] = [], trace?: string): Result => ({
  retry,
  status,
  errors,
  attachments: [
    { name: 'error-context', path: `${CWD}/test-results/${trace ?? 'x'}/error-context.md` },
    ...(trace ? [{ name: 'trace', path: `${CWD}/test-results/${trace}/trace.zip` }] : []),
  ],
});
const spec = (title: string, line: number, status: string, results: Result[]) => ({
  title,
  file: 'boss.spec.ts',
  line,
  column: 1,
  tests: [{ projectName: 'chromium', status, results }],
});
const report = (specs: unknown[], suites?: unknown[], errors: Err[] = []) => ({
  config: { rootDir: `${CWD}/e2e`, version: '1.63.0' },
  suites: [{ title: 'boss.spec.ts', file: 'boss.spec.ts', specs, suites }],
  errors,
});

const passed = spec('passes', 2, 'expected', [result(0, 'passed')]);
const skipped = spec('skipped', 9, 'skipped', [result(0, 'skipped')]);
const failed = spec('start The Echo', 3, 'unexpected', [
  result(0, 'timedOut', [testTimeout, clickTimeout]),
  result(1, 'timedOut', [testTimeout, clickTimeout], 'boss-echo-retry1'),
]);
const flaky = spec('click a marble', 20, 'flaky', [
  result(0, 'failed', [{ message: 'Error: expect(locator).toContainText(expected) failed' }]),
  result(1, 'passed', [], 'boss-marble-retry1'),
]);
const nested = { title: 'group', file: 'boss.spec.ts', specs: [spec('nested', 6, 'unexpected', [result(0, 'failed', [{ value: 'thrown string' }])])] };

describe('errorLines', () => {
  it('keeps the message, the failing source line and its location, without colours, snippet or stack', () => {
    expect(errorLines(clickTimeout, CWD)).toEqual([
      'Error: locator.click: Test timeout of 30000ms exceeded.',
      'Call log:',
      "  - waiting for locator('#boss-list')",
      "> 14 |   await page.locator('#boss-list').click();",
      'at e2e/boss.spec.ts:14:78',
    ]);
  });

  it('keeps a plain message as is', () => {
    expect(errorLines(testTimeout, CWD)).toEqual(['Test timeout of 30000ms exceeded.']);
  });

  it('falls back on the thrown value, then on nothing', () => {
    expect(errorLines({ value: 'thrown string' }, CWD)).toEqual(['thrown string']);
    expect(errorLines({}, CWD)).toEqual([]);
  });

  it('cuts long messages to six lines and long lines to 200 characters', () => {
    const message = ['a'.repeat(250), ...Array.from({ length: 8 }, (_, i) => `line ${i}`)].join('\n');
    expect(errorLines({ message }, CWD)).toEqual([`${'a'.repeat(200)}...`, 'line 0', 'line 1', 'line 2', 'line 3', 'line 4', '...']);
  });
});

describe('summarize', () => {
  it('sorts specs into failed, flaky, passed and skipped, with title path, location, errors and trace', () => {
    const summary = summarize(report([passed, failed, flaky, skipped], [nested]), CWD);
    expect(summary.passed).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.version).toBe('1.63.0');
    expect(summary.errors).toEqual([]);
    expect(summary.failed).toEqual([
      {
        title: 'start The Echo',
        location: 'e2e/boss.spec.ts:3',
        errors: [errorLines(testTimeout, CWD), errorLines(clickTimeout, CWD)],
        trace: 'test-results/boss-echo-retry1/trace.zip',
      },
      { title: 'group › nested', location: 'e2e/boss.spec.ts:6', errors: [['thrown string']], trace: undefined },
    ]);
    expect(summary.flaky).toEqual([
      {
        title: 'click a marble',
        location: 'e2e/boss.spec.ts:20',
        errors: [['Error: expect(locator).toContainText(expected) failed']],
        trace: 'test-results/boss-marble-retry1/trace.zip',
      },
    ]);
  });

  it('keeps at most three errors of the last failed attempt', () => {
    const many = [1, 2, 3, 4].map((n) => ({ message: `error ${n}` }));
    const s = spec('many', 4, 'unexpected', [result(0, 'failed', [{ message: 'first try' }]), result(1, 'failed', many)]);
    expect(summarize(report([s]), CWD).failed[0].errors).toEqual([['error 1'], ['error 2'], ['error 3']]);
  });

  it('gives no error lines for an unexpected pass (a test.fail() spec that passed)', () => {
    const s = spec('expected to fail', 5, 'unexpected', [result(0, 'passed')]);
    expect(summarize(report([s]), CWD).failed[0].errors).toEqual([]);
  });

  it('keeps errors raised outside any spec', () => {
    expect(summarize(report([], undefined, [{ message: 'Error: No tests found' }]), CWD).errors).toEqual([['Error: No tests found']]);
  });
});

describe('outcomeOf', () => {
  it('is fail when a spec failed twice or an error happened outside the specs', () => {
    expect(outcomeOf(summarize(report([failed, flaky]), CWD))).toBe('fail');
    expect(outcomeOf(summarize(report([passed], undefined, [testTimeout]), CWD))).toBe('fail');
  });

  it('is flaky when every failure passed on its retry', () => {
    expect(outcomeOf(summarize(report([passed, flaky]), CWD))).toBe('flaky');
  });

  it('is pass when every spec passed on its first run', () => {
    expect(outcomeOf(summarize(report([passed, skipped]), CWD))).toBe('pass');
  });
});

describe('contextFrom', () => {
  it('reads the run from the GitHub Actions environment', () => {
    expect(CTX).toEqual({
      repo: 'TidyMaze/ab-alone',
      repoUrl: REPO,
      runId: '123',
      runUrl: RUN,
      sha: SHA,
      baseUrl: 'https://tidymaze.github.io/ab-alone/',
      grepInvert: 'textures are requested',
    });
  });
});

type Call = [string, string[]];
const fakeExec = (answers: Record<string, string | Error>) => {
  const calls: Call[] = [];
  const exec = (cmd: string, args: string[]) => {
    calls.push([cmd, args]);
    const answer = answers[cmd];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { exec, calls };
};
const greenRun = JSON.stringify([{ headSha: GREEN, url: `${REPO}/actions/runs/99` }]);

describe('bisectHint', () => {
  it('names the first commit on main since the last green nightly', () => {
    const { exec, calls } = fakeExec({
      gh: greenRun,
      git: `${'a'.repeat(40)} feat: the Choir (#183)\n${'b'.repeat(40)} fix: a later commit\n`,
    });
    expect(bisectHint(CTX, exec, () => {})).toBe(
      `First commit on \`main\` since the last green nightly ([run](${REPO}/actions/runs/99) on [\`beef000\`](${REPO}/commit/${GREEN})): ` +
        `[\`aaaaaaa\`](${REPO}/commit/${'a'.repeat(40)}) \`feat: the Choir (#183)\`. ` +
        `2 commits since then: ${REPO}/compare/${GREEN}...${SHA}`,
    );
    expect(calls).toEqual([
      ['gh', ['run', 'list', '--repo', 'TidyMaze/ab-alone', '--workflow', 'nightly.yml', '--branch', 'main', '--status', 'success', '--limit', '1', '--json', 'headSha,url']],
      ['git', ['log', '--reverse', '--format=%H %s', `${GREEN}..${SHA}`]],
    ]);
  });

  it('says one commit in the singular', () => {
    const { exec } = fakeExec({ gh: greenRun, git: `${'a'.repeat(40)} feat: one\n` });
    expect(bisectHint(CTX, exec, () => {})).toContain(`1 commit since then: ${REPO}/compare/`);
  });

  it('says when nothing was merged since the last green nightly', () => {
    const { exec } = fakeExec({ gh: greenRun, git: '' });
    expect(bisectHint(CTX, exec, () => {})).toBe(
      `No commit on \`main\` since the last green nightly ([run](${REPO}/actions/runs/99) on [\`beef000\`](${REPO}/commit/${GREEN})): ` +
        'the failure does not come from a code change. Suspect the live site, the network or a spec that failed twice by chance.',
    );
  });

  it('says when no nightly on main was green yet', () => {
    const { exec, calls } = fakeExec({ gh: '[]' });
    expect(bisectHint(CTX, exec, () => {})).toBe('No green nightly on `main` yet, so no bisect hint.');
    expect(calls).toHaveLength(1);
  });

  it('says when the runs cannot be listed, and logs why', () => {
    const logs: string[] = [];
    const { exec } = fakeExec({ gh: new Error('HTTP 403') });
    expect(bisectHint(CTX, exec, (l: string) => logs.push(l))).toBe(
      'Could not list the nightly runs (`gh run list` failed, see the run log), so no bisect hint.',
    );
    expect(logs).toEqual(['gh run list failed: HTTP 403']);
  });

  it('says when the green commit is not in the history, and logs why', () => {
    const logs: string[] = [];
    const { exec } = fakeExec({ gh: greenRun, git: new Error('bad revision') });
    expect(bisectHint(CTX, exec, (l: string) => logs.push(l))).toBe(
      `The last green nightly ([run](${REPO}/actions/runs/99)) tested [\`beef000\`](${REPO}/commit/${GREEN}), ` +
        `which is not in this checkout: ${REPO}/compare/${GREEN}...${SHA}`,
    );
    expect(logs).toEqual(['git log failed: bad revision']);
  });
});

const DOWNLOAD = [
  `gh run download 123 --repo TidyMaze/ab-alone --name playwright-report --dir /tmp/nightly-123`,
  'bunx playwright show-report /tmp/nightly-123/playwright-report',
].join('\n');
const LIVE = 'E2E_BASE_URL=https://tidymaze.github.io/ab-alone/ bunx playwright test --project=chromium --workers=1';
const CHECKOUT = `git fetch origin && git checkout ${SHA}\ncd client && bun install --frozen-lockfile && bunx playwright install chromium`;

describe('issueFor', () => {
  const sections = (body: string) => body.match(/^### .+$/gm);

  it('opens a bug ready to work on when a spec failed twice', () => {
    const issue = issueFor(summarize(report([passed, failed, flaky, skipped]), CWD), CTX, 'HINT');
    expect(issue.title).toBe(FAILED_TITLE);
    expect(issue.title).toBe('Nightly e2e failed against the live site');
    expect(issue.label).toBe('bug');
    const body: string = issue.body;
    expect(body.startsWith('The nightly Playwright run against https://tidymaze.github.io/ab-alone/ failed: 1 failed, 1 flaky, 1 passed, 1 skipped.')).toBe(true);
    expect(body).toContain(`Run: ${RUN}`);
    expect(sections(body)).toEqual([
      '### Steps to reproduce',
      '### Expected',
      '### Actual',
      '### Bisect hint',
      '### Browser, OS and commit',
      '### Broken feature',
    ]);
    expect(body).toContain(`\`\`\`sh\n${CHECKOUT}\n${LIVE} e2e/boss.spec.ts:3\n\`\`\``);
    expect(body).toContain(
      'Failed on the first run and on the retry:\n\n- `e2e/boss.spec.ts:3` start The Echo\n' +
        '  ```\n  Test timeout of 30000ms exceeded.\n  ```\n' +
        "  ```\n  Error: locator.click: Test timeout of 30000ms exceeded.\n  Call log:\n    - waiting for locator('#boss-list')\n" +
        "  > 14 |   await page.locator('#boss-list').click();\n  at e2e/boss.spec.ts:14:78\n  ```\n" +
        '  Trace: `bunx playwright show-trace /tmp/nightly-123/test-results/boss-echo-retry1/trace.zip`',
    );
    expect(body).toContain('Flaky, failed then passed on the retry:\n\n- `e2e/boss.spec.ts:20` click a marble');
    expect(body).toContain(`Report and traces: artifact \`playwright-report\` on the [run page](${RUN}#artifacts). To open them, from \`client/\`:`);
    expect(body).toContain(DOWNLOAD);
    expect(body).toContain('### Bisect hint\n\nHINT');
    expect(body).toContain(
      `### Browser, OS and commit\n\nChromium (Playwright 1.63.0) on ubuntu-latest (GitHub Actions), against https://tidymaze.github.io/ab-alone/, commit ${SHA}`,
    );
    expect(body).toContain('P1, or P0 if it breaks a game (CONTRIBUTING.md section 6.7)');
    expect(body).not.toContain('Errors outside any spec');
  });

  it('lists errors outside the specs and reproduces the whole suite when no spec failed', () => {
    const body: string = issueFor(summarize(report([passed], undefined, [{ message: 'Error: No tests found' }]), CWD), CTX, 'HINT').body;
    expect(body).toContain('Errors outside any spec:\n\n```\nError: No tests found\n```');
    expect(body).toContain(`${LIVE} --grep-invert "textures are requested"\n\`\`\``);
    expect(body).not.toContain('Failed on the first run');
    expect(body).not.toContain('Flaky, failed then passed');
  });

  it('reproduces the whole suite without --grep-invert when none is set', () => {
    const ctx = contextFrom({ ...ENV, E2E_GREP_INVERT: undefined }, CWD);
    expect(issueFor(null, ctx, 'HINT').body).toContain(`${LIVE}\n\`\`\``);
  });

  it('opens a bug when the run failed before Playwright wrote its report', () => {
    const issue = issueFor(null, CTX, 'HINT');
    expect(issue.title).toBe(FAILED_TITLE);
    expect(issue.label).toBe('bug');
    expect(issue.body).toContain('failed before Playwright wrote its report');
    expect(issue.body).toContain('No Playwright report: see the failed step in the run log.');
    expect(issue.body).toContain(`${LIVE} --grep-invert "textures are requested"`);
    expect(issue.body).toContain('### Bisect hint\n\nHINT');
    expect(issue.body).toContain('Chromium (Playwright unknown)');
    expect(sections(issue.body)).toHaveLength(6);
  });

  it('opens a flaky issue, not a bug, when every failure passed on its retry', () => {
    const issue = issueFor(summarize(report([passed, flaky]), CWD), CTX, '');
    expect(issue.title).toBe(FLAKY_TITLE);
    expect(issue.title).toBe('Nightly e2e flaky against the live site');
    expect(issue.label).toBe('flaky');
    const body: string = issue.body;
    expect(body).toContain('1 spec failed on the first run and passed on the retry: flaky, passed on retry.');
    expect(body).toContain(`Run: ${RUN}`);
    expect(body).toContain('not a `bug` and gets no P1');
    expect(sections(body)).toEqual(['### Flaky specs', '### Reproduce', '### Browser, OS and commit']);
    expect(body).toContain(
      '- `e2e/boss.spec.ts:20` click a marble\n  ```\n  Error: expect(locator).toContainText(expected) failed\n  ```\n' +
        '  Trace: `bunx playwright show-trace /tmp/nightly-123/test-results/boss-marble-retry1/trace.zip`',
    );
    expect(body).toContain(`\`\`\`sh\n${CHECKOUT}\n${LIVE} --repeat-each=10 e2e/boss.spec.ts:20\n\`\`\``);
    expect(body).toContain(DOWNLOAD);
    expect(body).not.toContain('Bisect');
  });

  it('counts flaky specs in the plural', () => {
    const other = { ...flaky, title: 'another', line: 30 };
    expect(issueFor(summarize(report([flaky, other]), CWD), CTX, '').body).toContain('2 specs failed on the first run');
  });

  it('lists at most 20 specs', () => {
    const specs = Array.from({ length: 25 }, (_, i) => spec(`spec ${i}`, i + 1, 'unexpected', [result(0, 'failed', [{ message: 'boom' }])]));
    const body: string = issueFor(summarize(report(specs), CWD), CTX, 'HINT').body;
    expect(body).toContain('`e2e/boss.spec.ts:20` spec 19');
    expect(body).not.toContain('`e2e/boss.spec.ts:21` spec 20');
    expect(body).toContain('- and 5 more in the report');
  });

  it('cuts the body under the GitHub limit of 65536 characters', () => {
    const long = { message: Array.from({ length: 9 }, () => 'x'.repeat(300)).join('\n') };
    const specs = Array.from({ length: 20 }, (_, i) => spec(`spec ${i}`, i + 1, 'unexpected', [result(0, 'failed', [long, long, long])]));
    const body: string = issueFor(summarize(report(specs), CWD), CTX, 'HINT').body;
    expect(body.length).toBeLessThan(65_536);
    expect(body.endsWith('\n\n(cut at 60000 characters, see the run)')).toBe(true);
  });
});

const fakeDeps = (files: Record<string, string>, answers: Record<string, string | Error> = {}) => {
  const written: Record<string, string> = {};
  const logs: string[] = [];
  const { exec, calls } = fakeExec(answers);
  const deps = {
    env: { ...ENV, NIGHTLY_REPORT: 'test-results/nightly.json', GITHUB_OUTPUT: '/out', ISSUE_BODY_FILE: '/body.md' },
    cwd: CWD,
    readFile: (path: string) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    writeFile: (path: string, text: string) => (written[path] = text),
    appendFile: (path: string, text: string) => (written[path] = (written[path] ?? '') + text),
    exec,
    log: (line: string) => logs.push(line),
  };
  return { deps, written, logs, calls };
};

describe('main', () => {
  it('only writes the pass outcome when every spec passed', () => {
    const { deps, written, calls } = fakeDeps({ 'test-results/nightly.json': JSON.stringify(report([passed])) });
    expect(main(deps)).toBe('pass');
    expect(written).toEqual({ '/out': 'outcome=pass\n' });
    expect(calls).toEqual([]);
  });

  it('writes the flaky issue without looking for a bisect hint', () => {
    const { deps, written, calls, logs } = fakeDeps({ 'test-results/nightly.json': JSON.stringify(report([flaky])) });
    expect(main(deps)).toBe('flaky');
    expect(written['/out']).toBe(`outcome=flaky\ntitle=${FLAKY_TITLE}\nlabel=flaky\n`);
    expect(written['/body.md']).toContain('flaky, passed on retry');
    expect(calls).toEqual([]);
    expect(logs).toEqual([`flaky: ${FLAKY_TITLE}`]);
  });

  it('writes the bug issue with the bisect hint when a spec failed twice', () => {
    const { deps, written } = fakeDeps({ 'test-results/nightly.json': JSON.stringify(report([failed])) }, { gh: '[]' });
    expect(main(deps)).toBe('fail');
    expect(written['/out']).toBe(`outcome=fail\ntitle=${FAILED_TITLE}\nlabel=bug\n`);
    expect(written['/body.md']).toContain('### Bisect hint\n\nNo green nightly on `main` yet');
    expect(written['/body.md']).toContain('`e2e/boss.spec.ts:3` start The Echo');
  });

  it('writes a bug issue when the report is missing or broken, and logs why', () => {
    for (const files of [{}, { 'test-results/nightly.json': '{"suites": [' }]) {
      const { deps, written, logs } = fakeDeps(files, { gh: '[]' });
      expect(main(deps)).toBe('fail');
      expect(written['/body.md']).toContain('failed before Playwright wrote its report');
      expect(logs[0]).toMatch(/^No usable Playwright report at test-results\/nightly.json: /);
    }
  });
});

describe('nightly-report-cli', () => {
  it('runs main with the real file system: flaky report in, outputs and body out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nightly-report-'));
    writeFileSync(join(dir, 'nightly.json'), JSON.stringify(report([flaky])));
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./nightly-report-cli.mjs', import.meta.url))], {
      cwd: dir,
      env: { ...ENV, NIGHTLY_REPORT: join(dir, 'nightly.json'), GITHUB_OUTPUT: join(dir, 'out'), ISSUE_BODY_FILE: join(dir, 'body.md') },
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`flaky: ${FLAKY_TITLE}`);
    expect(readFileSync(join(dir, 'out'), 'utf8')).toBe(`outcome=flaky\ntitle=${FLAKY_TITLE}\nlabel=flaky\n`);
    expect(readFileSync(join(dir, 'body.md'), 'utf8')).toContain('flaky, passed on retry');
  });
});

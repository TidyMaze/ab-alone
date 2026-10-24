// Turns the Playwright JSON report of the nightly run into the issue to open: a `bug` when a spec failed on
// its first run and on its retry, a `flaky` issue when every failure passed on its retry, nothing on a clean pass.
// Pure Node, no dependency, no LLM: run by .github/workflows/nightly.yml through nightly-report-cli.mjs.
// Flow and limits: docs/specs/ci-repair.md.
import { join, relative } from 'node:path';

export const FAILED_TITLE = 'Nightly e2e failed against the live site';
export const FLAKY_TITLE = 'Nightly e2e flaky against the live site';
// The only project the nightly runs (nightly.yml).
const PROJECT = 'chromium';
const MAX_SPECS = 20;
const MAX_ERRORS = 3;
const MAX_LINES = 6;
const MAX_LINE = 200;
// GitHub refuses an issue body over 65536 characters.
const MAX_BODY = 60_000;

const ANSI = /\u001b\[[0-9;]*m/g;
const SNIPPET = /^\s*>?\s*\d+ \|/;
const CARET = /^\s*\|/;
const STACK = /^\s+at /;
const MARKED = /^\s*>\s*\d+ \|/;

const cut = (line) => (line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}...` : line);
const short = (sha) => sha.slice(0, 7);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The lines of a Playwright error worth reading in an issue: the message, the source line marked `>` in the
// snippet, and where it failed. Colours, the rest of the snippet and the stack are dropped.
export function errorLines(error, cwd) {
  const lines = String(error.message ?? error.value ?? '')
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trimEnd());
  const text = lines.filter((l) => l.trim() !== '' && !SNIPPET.test(l) && !CARET.test(l) && !STACK.test(l));
  const shown = text.slice(0, MAX_LINES);
  if (text.length > MAX_LINES) shown.push('...');
  const marked = lines.find((l) => MARKED.test(l));
  if (marked) shown.push(marked.trim());
  if (error.location) {
    const { file, line, column } = error.location;
    shown.push(`at ${relative(cwd, file)}:${line}:${column}`);
  }
  return shown.map(cut);
}

function entry(report, spec, test, titles, cwd) {
  const failedRuns = test.results.filter((r) => r.status !== 'passed' && r.status !== 'skipped');
  const last = failedRuns[failedRuns.length - 1];
  const trace = test.results.flatMap((r) => r.attachments).find((a) => a.name === 'trace');
  return {
    title: [...titles, spec.title].join(' › '),
    location: `${relative(cwd, join(report.config.rootDir, spec.file))}:${spec.line}`,
    errors: (last?.errors ?? []).slice(0, MAX_ERRORS).map((e) => errorLines(e, cwd)),
    trace: trace && relative(cwd, trace.path),
  };
}

// Playwright marks a test `unexpected` when it failed on every attempt, `flaky` when it failed then passed.
export function summarize(report, cwd) {
  const summary = { failed: [], flaky: [], passed: 0, skipped: 0, errors: report.errors.map((e) => errorLines(e, cwd)) };
  summary.version = report.config.version;
  const visit = (suite, titles) => {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        if (test.status === 'unexpected') summary.failed.push(entry(report, spec, test, titles, cwd));
        else if (test.status === 'flaky') summary.flaky.push(entry(report, spec, test, titles, cwd));
        else if (test.status === 'skipped') summary.skipped += 1;
        else summary.passed += 1;
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title]);
  };
  for (const file of report.suites) visit(file, []);
  return summary;
}

export function outcomeOf(summary) {
  if (summary.failed.length > 0 || summary.errors.length > 0) return 'fail';
  return summary.flaky.length > 0 ? 'flaky' : 'pass';
}

export function contextFrom(env, cwd) {
  const repoUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
  return {
    repo: env.GITHUB_REPOSITORY,
    repoUrl,
    runId: env.GITHUB_RUN_ID,
    runUrl: `${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}`,
    sha: env.GITHUB_SHA,
    baseUrl: env.E2E_BASE_URL,
    grepInvert: env.E2E_GREP_INVERT,
  };
}

// A cheap bisect from git log: the first commit between the last green nightly on main and the tested commit.
export function bisectHint(ctx, exec, log) {
  let runs;
  try {
    runs = JSON.parse(exec('gh', ['run', 'list', '--repo', ctx.repo, '--workflow', 'nightly.yml', '--branch', 'main',
      '--status', 'success', '--limit', '1', '--json', 'headSha,url']));
  } catch (e) {
    log(`gh run list failed: ${e.message}`);
    return 'Could not list the nightly runs (`gh run list` failed, see the run log), so no bisect hint.';
  }
  const green = runs[0];
  if (!green) return 'No green nightly on `main` yet, so no bisect hint.';
  const commitLink = (sha) => `[\`${short(sha)}\`](${ctx.repoUrl}/commit/${sha})`;
  const compare = `${ctx.repoUrl}/compare/${green.headSha}...${ctx.sha}`;
  let commits;
  try {
    commits = exec('git', ['log', '--reverse', '--format=%H %s', `${green.headSha}..${ctx.sha}`]).split('\n').filter(Boolean);
  } catch (e) {
    log(`git log failed: ${e.message}`);
    return `The last green nightly ([run](${green.url})) tested ${commitLink(green.headSha)}, which is not in this checkout: ${compare}`;
  }
  const since = `since the last green nightly ([run](${green.url}) on ${commitLink(green.headSha)})`;
  if (commits.length === 0) {
    return `No commit on \`main\` ${since}: the failure does not come from a code change. ` +
      'Suspect the live site, the network or a spec that failed twice by chance.';
  }
  const [first] = commits;
  const sha = first.slice(0, first.indexOf(' '));
  // The subject goes in a code span: a `(#123)` in it must not cross-link the issue to that PR.
  return `First commit on \`main\` ${since}: ${commitLink(sha)} \`${first.slice(sha.length + 1)}\`. ` +
    `${plural(commits.length, 'commit')} since then: ${compare}`;
}

const downloadDir = (ctx) => `/tmp/nightly-${ctx.runId}`;

function specItem(spec, ctx) {
  const lines = [`- \`${spec.location}\` ${spec.title}`];
  for (const error of spec.errors) lines.push(...['```', ...error, '```'].map((l) => `  ${l}`));
  if (spec.trace) lines.push(`  Trace: \`npx playwright show-trace ${downloadDir(ctx)}/${spec.trace}\``);
  return lines.join('\n');
}

function specList(specs, ctx) {
  const items = specs.slice(0, MAX_SPECS).map((s) => specItem(s, ctx));
  if (specs.length > MAX_SPECS) items.push(`- and ${specs.length - MAX_SPECS} more in the report`);
  return items.join('\n');
}

const locations = (specs) => specs.map((s) => s.location).join(' ');
const fullSuite = (ctx) => (ctx.grepInvert ? `--grep-invert "${ctx.grepInvert}"` : '');

function repro(ctx, args) {
  return ['```sh', `git fetch origin && git checkout ${ctx.sha}`, `cd client && npm ci && npx playwright install ${PROJECT}`,
    `E2E_BASE_URL=${ctx.baseUrl} npx playwright test --project=${PROJECT} --workers=1 ${args}`.trimEnd(), '```'].join('\n');
}

function artifacts(ctx) {
  const dir = downloadDir(ctx);
  return [`Report and traces: artifact \`playwright-report\` on the [run page](${ctx.runUrl}#artifacts). To open them, from \`client/\`:`,
    '', '```sh', `gh run download ${ctx.runId} --repo ${ctx.repo} --name playwright-report --dir ${dir}`,
    `npx playwright show-report ${dir}/playwright-report`, '```'].join('\n');
}

const environment = (ctx, version) =>
  `Chromium (Playwright ${version}) on ubuntu-latest (GitHub Actions), against ${ctx.baseUrl}, commit ${ctx.sha}`;

// The headings of the Bug form (.github/ISSUE_TEMPLATE/4-bug.yml), plus the bisect hint.
function bugBody(ctx, hint, intro, reproArgs, actual, version) {
  return [`${intro} Run: ${ctx.runUrl}`,
    '### Steps to reproduce', 'At the commit the nightly tested, against the live site, from the repo root:', repro(ctx, reproArgs),
    '### Expected', 'Every e2e spec passes against the live site.',
    '### Actual', ...actual,
    '### Bisect hint', hint,
    '### Browser, OS and commit', environment(ctx, version),
    '### Broken feature', 'To find at triage from the failing specs. A nightly failure is a bug: P1, or P0 if it breaks a game (CONTRIBUTING.md section 6.7).',
  ].join('\n\n');
}

function failedBody(summary, ctx, hint) {
  const { failed, flaky, passed, skipped, errors } = summary;
  const actual = [];
  if (failed.length > 0) actual.push('Failed on the first run and on the retry:', specList(failed, ctx));
  if (flaky.length > 0) actual.push('Flaky, failed then passed on the retry:', specList(flaky, ctx));
  if (errors.length > 0) actual.push('Errors outside any spec:', ...errors.map((e) => ['```', ...e, '```'].join('\n')));
  actual.push(artifacts(ctx));
  const intro = `The nightly Playwright run against ${ctx.baseUrl} failed: ${failed.length} failed, ${flaky.length} flaky, ` +
    `${passed} passed, ${skipped} skipped.`;
  return bugBody(ctx, hint, intro, failed.length > 0 ? locations(failed) : fullSuite(ctx), actual, summary.version);
}

function flakyBody(summary, ctx) {
  return [`The nightly Playwright run against ${ctx.baseUrl} passed, but ${plural(summary.flaky.length, 'spec')} failed on the first run ` +
    `and passed on the retry: flaky, passed on retry. Run: ${ctx.runUrl}`,
  'The live site works, so this is not a `bug` and gets no P1. Triage: a task to make the spec stable, ' +
    'or close this issue if it does not come back.',
  '### Flaky specs', specList(summary.flaky, ctx), artifacts(ctx),
  '### Reproduce', 'One run most likely passes. Repeat the spec at the commit the nightly tested, against the live site, from the repo root:',
  repro(ctx, `--repeat-each=10 ${locations(summary.flaky)}`),
  '### Browser, OS and commit', environment(ctx, summary.version),
  ].join('\n\n');
}

const capped = (body) => (body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n\n(cut at ${MAX_BODY} characters, see the run)` : body);

// summary is null when the run failed before Playwright wrote its report.
export function issueFor(summary, ctx, hint) {
  if (summary === null) {
    const intro = `The nightly run against ${ctx.baseUrl} failed before Playwright wrote its report ` +
      '(an install step, the browser download or Playwright itself).';
    return { title: FAILED_TITLE, label: 'bug',
      body: bugBody(ctx, hint, intro, fullSuite(ctx), ['No Playwright report: see the failed step in the run log.'], 'unknown') };
  }
  if (outcomeOf(summary) === 'flaky') return { title: FLAKY_TITLE, label: 'flaky', body: capped(flakyBody(summary, ctx)) };
  return { title: FAILED_TITLE, label: 'bug', body: capped(failedBody(summary, ctx, hint)) };
}

function readSummary(deps) {
  const path = deps.env.NIGHTLY_REPORT;
  try {
    return summarize(JSON.parse(deps.readFile(path)), deps.cwd);
  } catch (e) {
    deps.log(`No usable Playwright report at ${path}: ${e.message}`);
    return null;
  }
}

// Writes `outcome` (pass, flaky or fail), then `title` and `label` to GITHUB_OUTPUT, and the issue body to
// ISSUE_BODY_FILE. The workflow opens the issue unless one with the same title is open.
export function main(deps) {
  const { env } = deps;
  const ctx = contextFrom(env, deps.cwd);
  const summary = readSummary(deps);
  const outcome = summary === null ? 'fail' : outcomeOf(summary);
  deps.appendFile(env.GITHUB_OUTPUT, `outcome=${outcome}\n`);
  if (outcome === 'pass') {
    deps.log('pass: every spec passed on its first run');
    return outcome;
  }
  const hint = outcome === 'fail' ? bisectHint(ctx, deps.exec, deps.log) : '';
  const issue = issueFor(summary, ctx, hint);
  deps.writeFile(env.ISSUE_BODY_FILE, issue.body);
  deps.appendFile(env.GITHUB_OUTPUT, `title=${issue.title}\nlabel=${issue.label}\n`);
  deps.log(`${outcome}: ${issue.title}`);
  return outcome;
}

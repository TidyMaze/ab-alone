import { readFileSync } from 'node:fs';

// Turns a Playwright JSON report into the markdown table of the slowest tests, for the GitHub run summary (#323).
// Usage: bun run scripts/slowest-tests.ts e2e-results.json >> "$GITHUB_STEP_SUMMARY"

interface Suite {
  title: string;
  specs?: { title: string; tests: { results: { duration: number }[] }[] }[];
  suites?: Suite[];
}

export interface TestTime {
  name: string;
  ms: number;
}

// A test can run several times (retries): its time is the sum of every attempt.
export function slowestTests(report: { suites: Suite[] }, n: number): TestTime[] {
  const times: TestTime[] = [];
  const walk = (suite: Suite, titles: string[]) => {
    const path = [...titles, suite.title];
    for (const spec of suite.specs ?? []) {
      const ms = spec.tests.reduce((sum, t) => sum + t.results.reduce((s, r) => s + r.duration, 0), 0);
      times.push({ name: [...path, spec.title].join(' › '), ms });
    }
    for (const child of suite.suites ?? []) walk(child, path);
  };
  for (const suite of report.suites) walk(suite, []);
  return times.sort((a, b) => b.ms - a.ms).slice(0, n);
}

export function toMarkdown(times: TestTime[]): string {
  if (times.length === 0) return 'No test result in the Playwright report.';
  const rows = times.map((t, i) => `| ${i + 1} | ${t.name.replaceAll('|', '\\|')} | ${(t.ms / 1000).toFixed(1)} s |`);
  return ['| # | Test | Duration |', '|---|---|---|', ...rows].join('\n');
}

/** The script: prints the table of the report in `file`, or says there is none and exits 0. */
export function main(file: string): void {
  let report: { suites: Suite[] };
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.log('No Playwright JSON report: the shard stopped before the tests ran.');
    process.exit(0);
  }
  console.log(toMarkdown(slowestTests(report, 10)));
}

// Run as a script: the same check as the asset generators, which a test can make true (import.meta.main it cannot).
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv[2] ?? 'e2e-results.json');

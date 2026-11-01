import { defineConfig, type ReporterDescription } from '@playwright/test';

// E2E_PORT lets parallel checkouts each run their own dev server.
const port = process.env.E2E_PORT ?? '5173';
// The dev server serves the few specs that test the dev server itself (dev-server, lights-panel).
process.env.E2E_DEV_URL ??= `http://localhost:${port}/`;
// The other specs run on a build of the page (`vite build --mode e2e`, no remote fonts, 2 to 3 s) served by `vite preview`:
// the dev server transforms every module again on each page load (#1289: 10 % less time, 13 % less CPU on 98 tests).
// E2E_SERVER=dev runs every spec on the dev server, for a spec being written.
// The workers load this file again: the port is kept in the environment, like the preview port below.
process.env.E2E_PAGE_PORT ??= String(20_000 + Math.floor(Math.random() * 40_000));
const e2ePort = process.env.E2E_PAGE_PORT;
const onDev = process.env.E2E_SERVER === 'dev';
// E2E_BASE_URL points the suite at a running site, for example the GitHub Pages build.
const baseURL = process.env.E2E_BASE_URL;
// The offline spec needs the production build and its service worker (#193): `vite build`, then `vite preview` on
// its own random port. The workers read the port and the URL from the environment set here.
process.env.E2E_PREVIEW_PORT ??= String(20_000 + Math.floor(Math.random() * 40_000));
const previewPort = process.env.E2E_PREVIEW_PORT;
process.env.E2E_PREVIEW_URL ??= baseURL ?? `http://localhost:${previewPort}/ab-alone/`;

// On CI, the HTML report is uploaded with test-results/ when the e2e job fails.
// scripts/shard-reporter.ts does the --shard split: it deals the tests to the shards back and forth, so a run of slow
// tests is spread over every shard instead of landing in one (#333). Without --shard it does nothing.
const reporter: ReporterDescription[] = [
  ['list'],
  ...(process.env.CI ? [['html', { open: 'never' }] as ReporterDescription] : []),
  // On CI, the JSON report feeds the slowest-tests table in the run summary (scripts/slowest-tests.ts, #323).
  ...(process.env.CI ? [['json', { outputFile: 'e2e-results.json' }] as ReporterDescription] : []),
  ['./scripts/shard-reporter.ts'],
];

export default defineConfig({
  testDir: 'e2e',
  reporter,
  // CI runners have no GPU: every page draws with software WebGL on all cores. Two workers starved each other, a frame took
  // 1.5 s and clicks timed out (#216); one worker passes all specs (run 40103771311).
  // Locally 4 workers at most: the machine stays usable by a person (owner, 2026-11-01). Playwright's default is half the cores.
  workers: process.env.CI ? 1 : 4,
  // CI splits the suite across runners with --shard (#257), test by test (scripts/shard-reporter.ts, #333).
  fullyParallel: !!process.env.CI,
  // Every e2e test passes in under 15 s, locally and on CI, and a slower one fails (CONTRIBUTING.md, #349).
  // No test.slow() or test.setTimeout() override: a test that needs more is made cheaper.
  timeout: 15_000,
  // A wait on a state (expect, expect.poll) gets 10 s instead of 5 s: under 4 workers a page took more than 5 s to build the Open world (#1383).
  // The test itself still fails at 15 s.
  expect: { timeout: 10_000 },
  // One retry, locally too: a test that passes on the retry is reported flaky, not red (#1383). The trace of the retried run is kept.
  retries: 1,
  // No service worker outside the offline spec: a cache left by one test must never serve another (#193).
  // On CI the page draws with software WebGL, a frame costs by its pixels and every click waits for one (#216): a 960x540
  // window draws 44 % fewer pixels than the 1280x720 default, and stays above the 768 px width of the low quality tier (#258).
  use: {
    baseURL: baseURL ?? (onDev ? `http://localhost:${port}` : `http://localhost:${e2ePort}/ab-alone/`),
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    ...(process.env.CI ? { viewport: { width: 960, height: 540 } } : {}),
  },
  projects: [
    // Locally on a Mac, Chromium draws on the GPU: with SwiftShader, its software WebGL, the first draw of a page built
    // every shader pipeline in one task of 2 to 10 s that blocked the page (bug #563). CI runners have no GPU. With
    // WebGPUService off the page keeps the WebGL2 backend that CI tests.
    {
      name: 'chromium',
      // The contrast checks (tag @contrast) are a report for the art director, not a gate: `bun run e2e:contrast` runs them (#1383).
      grepInvert: process.env.E2E_CONTRAST ? undefined : /@contrast/,
      use: {
        browserName: 'chromium',
        ...(!process.env.CI && process.platform === 'darwin'
          ? { launchOptions: { args: ['--enable-gpu', '--disable-features=WebGPUService'] } }
          : {}),
      },
    },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  // Playwright starts the servers in this order and stops both: the dev server rebuilds the wasm package before the
  // production build reads it.
  webServer: baseURL
    ? undefined
    : [
        {
          // --mode e2e: the server does not watch files, so nothing written to the checkout reloads a page under test (#185).
          // E2E_SKIP_WASM_BUILD (CI shards): the package is already there, `bun run dev` would rebuild it with wasm-pack.
          command: `${process.env.E2E_SKIP_WASM_BUILD ? 'bunx vite' : 'bun run dev'} --port ${port} --strictPort --mode e2e`,
          url: `http://localhost:${port}`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        ...(onDev
          ? []
          : [
              {
                // Its own outDir: the production build below empties dist/.
                command: `bunx vite build --mode e2e --outDir dist-e2e --logLevel warn && bunx vite preview --mode e2e --outDir dist-e2e --port ${e2ePort} --strictPort`,
                url: `http://localhost:${e2ePort}/ab-alone/`,
                reuseExistingServer: false,
                timeout: 120_000,
              },
            ]),
        {
          command: `bunx vite build --logLevel warn && bunx vite preview --port ${previewPort} --strictPort`,
          url: process.env.E2E_PREVIEW_URL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});

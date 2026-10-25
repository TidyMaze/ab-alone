import type { FullConfig, Reporter, Suite, TestRun } from '@playwright/test/reporter';

// Playwright's --shard cuts the ordered test list into equal runs of tests, so a run of slow tests lands in one shard:
// phone-layout.spec.ts made shard 3 take 13 min and shard 4 3 min (run 40149050911, #333). This reporter deals the
// tests to the shards instead, back and forth like cards (1, 2, 3, 4, 4, 3, 2, 1, 1, 2, ...), so the slow tests of
// one spec file spread over every shard. Each test still runs in exactly one shard.
export function shardOf(index: number, total: number): number {
  const turn = index % (2 * total);
  return turn < total ? turn + 1 : 2 * total - turn;
}

export default class ShardReporter implements Reporter {
  async preprocess({ config, suite, testRun }: { config: FullConfig; suite: Suite; testRun: TestRun }) {
    const { shard } = config;
    if (!shard) return;
    testRun.skipSharding();
    suite.allTests().forEach((test, i) => {
      if (shardOf(i, shard.total) !== shard.current) testRun.exclude(test);
    });
  }

  printsToStdio() {
    return false;
  }
}

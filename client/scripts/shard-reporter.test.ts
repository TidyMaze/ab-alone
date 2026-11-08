import type { FullConfig, Suite, TestCase, TestRun } from '@playwright/test/reporter';
import { describe, expect, it, vi } from 'vitest';
import ShardReporter, { shardOf } from './shard-reporter';

const tests = Array.from({ length: 10 }, (_, i) => ({ title: `test ${i}` }) as TestCase);

function preprocess(shard: FullConfig['shard']) {
  const testRun = { skipSharding: vi.fn(), exclude: vi.fn() };
  void new ShardReporter().preprocess({
    config: { shard } as FullConfig,
    suite: { allTests: () => tests } as Suite,
    testRun: testRun as unknown as TestRun,
  });
  return testRun;
}

describe('shardOf', () => {
  it('deals the tests to the shards back and forth, like cards', () => {
    expect(Array.from({ length: 10 }, (_, i) => shardOf(i, 4))).toEqual([1, 2, 3, 4, 4, 3, 2, 1, 1, 2]);
  });

  it('gives every test to exactly one shard', () => {
    for (const total of [1, 2, 3, 4, 5]) {
      for (let i = 0; i < 50; i++) {
        const shard = shardOf(i, total);
        expect(shard).toBeGreaterThanOrEqual(1);
        expect(shard).toBeLessThanOrEqual(total);
      }
    }
  });
});

describe('ShardReporter', () => {
  it('leaves a run without --shard alone', () => {
    const testRun = preprocess(null);
    expect(testRun.skipSharding).not.toHaveBeenCalled();
    expect(testRun.exclude).not.toHaveBeenCalled();
  });

  it('replaces the built-in split and keeps only the tests dealt to this shard', () => {
    const testRun = preprocess({ current: 2, total: 4 });
    expect(testRun.skipSharding).toHaveBeenCalledOnce();
    const kept = tests.filter((test) => !testRun.exclude.mock.calls.some(([excluded]) => excluded === test));
    expect(kept.map((test) => test.title)).toEqual(['test 1', 'test 6', 'test 9']);
  });

  it('runs the whole suite once across the shards', () => {
    const kept = [1, 2, 3, 4].flatMap((current) => {
      const testRun = preprocess({ current, total: 4 });
      return tests.filter((test) => !testRun.exclude.mock.calls.some(([excluded]) => excluded === test));
    });
    expect(kept.map((test) => test.title).sort()).toEqual(tests.map((test) => test.title).sort());
  });

  it('deals a one-page group (tag @one-page) to one shard as one card, its tests in order', () => {
    const group = { title: 'a phone' } as Suite;
    const grouped = (title: string) => ({ title, tags: ['@one-page'], parent: group }) as unknown as TestCase;
    const all = [tests[0]!, grouped('start'), grouped('boss fight'), grouped('online'), tests[1]!, tests[2]!];
    const kept = [1, 2].map((current) => {
      const testRun = { skipSharding: vi.fn(), exclude: vi.fn() };
      void new ShardReporter().preprocess({
        config: { shard: { current, total: 2 } } as FullConfig,
        suite: { allTests: () => all } as Suite,
        testRun: testRun as unknown as TestRun,
      });
      return all.filter((test) => !testRun.exclude.mock.calls.some(([excluded]) => excluded === test)).map((test) => test.title);
    });
    expect(kept).toEqual([['test 0', 'test 2'], ['start', 'boss fight', 'online', 'test 1']]);
  });

  it('prints nothing itself', () => {
    expect(new ShardReporter().printsToStdio()).toBe(false);
  });
});

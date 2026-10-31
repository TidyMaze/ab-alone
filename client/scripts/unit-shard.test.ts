import { describe, expect, it, vi } from 'vitest';
import { dealShards, main, testFiles } from './unit-shard';

const sized = (...sizes: number[]) => sizes.map((size, i) => ({ path: `f${i}.test.ts`, size }));

describe('dealShards (#1079)', () => {
  it('gives each file to the lightest shard, heaviest first', () => {
    const shards = dealShards(sized(9, 8, 3, 3, 2, 1), 3);
    expect(shards).toEqual([['f0.test.ts'], ['f1.test.ts', 'f5.test.ts'], ['f2.test.ts', 'f3.test.ts', 'f4.test.ts']]); // 9, 8+1, 3+3+2
  });

  it('runs every file in exactly one shard', () => {
    const files = sized(5, 4, 4, 3, 3, 3, 2, 1, 1, 1);
    const all = dealShards(files, 4).flat().sort();
    expect(all).toEqual(files.map((f) => f.path).sort());
  });

  it('leaves a shard empty when there are fewer files than shards', () => {
    expect(dealShards(sized(1), 2)).toEqual([['f0.test.ts'], []]);
  });

  it('is the same on every call, so the shards of one run agree', () => {
    expect(dealShards(sized(2, 2, 2), 2)).toEqual(dealShards(sized(2, 2, 2), 2));
  });
});

describe('testFiles', () => {
  it('lists the test files under src and scripts with their size, skipping other files', () => {
    const tree: Record<string, { name: string; dir: boolean }[]> = {
      src: [{ name: 'a.test.ts', dir: false }, { name: 'a.ts', dir: false }, { name: 'test', dir: true }],
      'src/test': [{ name: 'b.test.ts', dir: false }],
      scripts: [{ name: 'c.test.ts', dir: false }, { name: 'd.mjs', dir: false }],
    };
    const list = (dir: string) => tree[dir] ?? [];
    const size = (p: string) => p.length;
    expect(testFiles(['src', 'scripts'], list, size)).toEqual([
      { path: 'src/a.test.ts', size: 'src/a.test.ts'.length },
      { path: 'src/test/b.test.ts', size: 'src/test/b.test.ts'.length },
      { path: 'scripts/c.test.ts', size: 'scripts/c.test.ts'.length },
    ]);
  });
});

describe('on the real files', () => {
  it('lists this test file with its size, and main prints a shard of the real tree', () => {
    const found = testFiles(['scripts']);
    expect(found.find((f) => f.path === 'scripts/unit-shard.test.ts')!.size).toBeGreaterThan(0);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['1', '1'])).toBe(0);
    expect(log.mock.calls[0]![0]).toContain('scripts/unit-shard.test.ts');
    log.mockRestore();
  });
});

describe('main', () => {
  const tree = () => sized(9, 8, 3, 3, 2, 1);
  it('prints the files of shard i of n, space separated', () => {
    const out: string[] = [];
    expect(main(['2', '3'], tree, (s) => out.push(s))).toBe(0);
    expect(out).toEqual(['f1.test.ts f5.test.ts']);
  });

  it('refuses a shard outside 1..n or a missing argument', () => {
    const out: string[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main(['4', '3'], tree, (s) => out.push(s))).toBe(1);
    expect(main(['0', '3'], tree, (s) => out.push(s))).toBe(1);
    expect(main([], tree, (s) => out.push(s))).toBe(1);
    expect(error).toHaveBeenCalledTimes(3);
    expect(out).toEqual([]);
    error.mockRestore();
  });
});

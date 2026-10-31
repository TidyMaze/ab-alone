import { readdirSync, statSync } from 'node:fs';

// Vitest's --shard cuts the sorted file list into equal runs of files, not of time: with 182 files, one shard held the heavy
// `main.*.test.ts` page boots (49 s of tests) and three others about 10 to 15 s, so the CI wait was that of the slowest (#1079).
// This deals the files to the shards by size, heaviest first, each to the lightest shard so far: the size of a test file tracks its
// cost well enough, and the same files give the same shards on every runner.
export interface Sized {
  path: string;
  size: number;
}

export function dealShards(files: Sized[], total: number): string[][] {
  const shards = Array.from({ length: total }, () => ({ size: 0, paths: [] as string[] }));
  for (const file of [...files].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))) {
    const lightest = shards.reduce((min, s) => (s.size < min.size ? s : min));
    lightest.size += file.size;
    lightest.paths.push(file.path);
  }
  return shards.map((s) => s.paths);
}

export interface Entry {
  name: string;
  dir: boolean;
}
const readEntries = (dir: string): Entry[] => readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }));

/** The `*.test.ts` files under `roots`, with their size, in a stable order (the config's include: src and scripts). */
export function testFiles(
  roots: string[] = ['src', 'scripts'],
  list: (dir: string) => Entry[] = readEntries,
  size: (path: string) => number = (p) => statSync(p).size,
): Sized[] {
  const found: Sized[] = [];
  const walk = (dir: string): void => {
    for (const entry of list(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.dir) walk(path);
      else if (entry.name.endsWith('.test.ts')) found.push({ path, size: size(path) });
    }
  };
  roots.forEach(walk);
  return found;
}

export function main(argv: string[] = process.argv.slice(2), files: () => Sized[] = testFiles, print: (s: string) => void = console.log): number {
  const [index, total] = argv.map(Number);
  if (!(index >= 1 && index <= total)) {
    console.error('Usage: bun run scripts/unit-shard.ts <shard 1..n> <n>');
    return 1;
  }
  print(dealShards(files(), total)[index - 1].join(' '));
  return 0;
}

/* v8 ignore next 3 */
if (process.argv[1]?.endsWith('unit-shard.ts')) {
  process.exit(main());
}

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export interface Target {
  testFile: string;
  srcFile?: string;
}

export interface BuildOptions {
  coverage?: boolean;
  extraArgs?: string[];
}

export function resolveTarget(arg: string, fileExists: (p: string) => boolean = existsSync): Target {
  // If explicitly given a .test.ts file
  if (arg.endsWith('.test.ts')) {
    if (fileExists(arg)) {
      const tsSrc = arg.replace(/\.test\.ts$/, '.ts');
      const mjsSrc = arg.replace(/\.test\.ts$/, '.mjs');
      const srcFile = fileExists(tsSrc) ? tsSrc : fileExists(mjsSrc) ? mjsSrc : undefined;
      return { testFile: arg, srcFile };
    }
  }

  // If given a source file (.ts or .mjs)
  if (arg.endsWith('.ts') || arg.endsWith('.mjs')) {
    const testFile = arg.replace(/\.(ts|mjs)$/, '.test.ts');
    if (fileExists(testFile)) {
      return { testFile, srcFile: fileExists(arg) ? arg : undefined };
    }
  }

  // If given a bare name (e.g. "hud" or "rendermode")
  const candidates = [
    `src/${arg}.test.ts`,
    `scripts/${arg}.test.ts`,
  ];
  for (const testCandidate of candidates) {
    if (fileExists(testCandidate)) {
      const tsSrc = testCandidate.replace(/\.test\.ts$/, '.ts');
      const mjsSrc = testCandidate.replace(/\.test\.ts$/, '.mjs');
      const srcFile = fileExists(tsSrc) ? tsSrc : fileExists(mjsSrc) ? mjsSrc : undefined;
      return { testFile: testCandidate, srcFile };
    }
  }

  throw new Error(`Could not find test file for "${arg}".`);
}

export function buildVitestArgs(target: Target, options: BuildOptions = {}): string[] {
  const args = ['run', target.testFile];
  const useCoverage = options.coverage ?? (target.srcFile !== undefined);

  if (useCoverage && target.srcFile) {
    args.push('--coverage', `--coverage.include=${target.srcFile}`);
  }

  if (options.extraArgs && options.extraArgs.length > 0) {
    args.push(...options.extraArgs);
  }

  return args;
}

export type Spawner = (cmd: string, args: string[], opts: { stdio: 'inherit' }) => { status: number | null };

export function runVitest(cmd: string, args: string[], spawner: Spawner = spawnSync): number {
  const result = spawner(cmd, args, { stdio: 'inherit' });
  return result.status ?? 0;
}

export function main(
  argv: string[] = process.argv.slice(2),
  runner: (cmd: string, args: string[]) => number = runVitest,
  fileExists: (p: string) => boolean = existsSync,
): number {
  if (argv.length === 0) {
    console.log('Usage: bun run scripts/test-scoped.ts <test-or-src-file> [extra vitest flags...]');
    return 1;
  }

  const [targetArg, ...extraArgs] = argv;
  try {
    const target = resolveTarget(targetArg, fileExists);
    const vitestArgs = buildVitestArgs(target, { extraArgs });
    return runner('vitest', vitestArgs);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
}

/* v8 ignore next 3 */
if (process.argv[1]?.endsWith('test-scoped.ts')) {
  process.exit(main());
}

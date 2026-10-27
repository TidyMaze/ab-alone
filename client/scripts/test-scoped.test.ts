import { describe, expect, it, vi } from 'vitest';
import { buildVitestArgs, main, resolveTarget, runVitest } from './test-scoped';

describe('test-scoped', () => {
  describe('resolveTarget', () => {
    it('resolves test and src when given a .test.ts path with .ts source', () => {
      const exists = (p: string) => ['src/rendermode.test.ts', 'src/rendermode.ts'].includes(p);
      const res = resolveTarget('src/rendermode.test.ts', exists);
      expect(res).toEqual({
        testFile: 'src/rendermode.test.ts',
        srcFile: 'src/rendermode.ts',
      });
    });

    it('resolves test and src when given a .test.ts path with .mjs source', () => {
      const exists = (p: string) => ['scripts/gen-icons.test.ts', 'scripts/gen-icons.mjs'].includes(p);
      const res = resolveTarget('scripts/gen-icons.test.ts', exists);
      expect(res).toEqual({
        testFile: 'scripts/gen-icons.test.ts',
        srcFile: 'scripts/gen-icons.mjs',
      });
    });

    it('resolves test and undefined src when neither .ts nor .mjs exists for .test.ts path', () => {
      const exists = (p: string) => p === 'src/standalone.test.ts';
      const res = resolveTarget('src/standalone.test.ts', exists);
      expect(res).toEqual({
        testFile: 'src/standalone.test.ts',
        srcFile: undefined,
      });
    });

    it('falls through and throws if .test.ts path itself does not exist', () => {
      const exists = () => false;
      expect(() => resolveTarget('src/missing.test.ts', exists)).toThrow('Could not find test file for "src/missing.test.ts"');
    });

    it('resolves test and src when given a src .ts path', () => {
      const exists = (p: string) => ['src/rendermode.test.ts', 'src/rendermode.ts'].includes(p);
      const res = resolveTarget('src/rendermode.ts', exists);
      expect(res).toEqual({
        testFile: 'src/rendermode.test.ts',
        srcFile: 'src/rendermode.ts',
      });
    });

    it('resolves test when given a src .ts path whose source file does not exist', () => {
      const exists = (p: string) => p === 'src/rendermode.test.ts';
      const res = resolveTarget('src/rendermode.ts', exists);
      expect(res).toEqual({
        testFile: 'src/rendermode.test.ts',
        srcFile: undefined,
      });
    });

    it('falls through and throws if src .ts path has no matching test file', () => {
      const exists = (p: string) => p === 'src/only-source.ts';
      expect(() => resolveTarget('src/only-source.ts', exists)).toThrow('Could not find test file for "src/only-source.ts"');
    });

    it('falls through and throws if src .mjs path has no matching test file', () => {
      const exists = (p: string) => p === 'scripts/only-script.mjs';
      expect(() => resolveTarget('scripts/only-script.mjs', exists)).toThrow('Could not find test file for "scripts/only-script.mjs"');
    });

    it('resolves script .mjs and its .test.ts', () => {
      const exists = (p: string) => ['scripts/gen-assets.test.ts', 'scripts/gen-assets.mjs'].includes(p);
      const res = resolveTarget('scripts/gen-assets.mjs', exists);
      expect(res).toEqual({
        testFile: 'scripts/gen-assets.test.ts',
        srcFile: 'scripts/gen-assets.mjs',
      });
    });

    it('resolves bare name by looking into src/ with .ts', () => {
      const exists = (p: string) => ['src/hud.test.ts', 'src/hud.ts'].includes(p);
      const res = resolveTarget('hud', exists);
      expect(res).toEqual({
        testFile: 'src/hud.test.ts',
        srcFile: 'src/hud.ts',
      });
    });

    it('resolves bare name by looking into scripts/ with .mjs', () => {
      const exists = (p: string) => ['scripts/size-budget.test.ts', 'scripts/size-budget.mjs'].includes(p);
      const res = resolveTarget('size-budget', exists);
      expect(res).toEqual({
        testFile: 'scripts/size-budget.test.ts',
        srcFile: 'scripts/size-budget.mjs',
      });
    });

    it('resolves bare name with test file but without matching src', () => {
      const exists = (p: string) => p === 'src/only-test.test.ts';
      const res = resolveTarget('only-test', exists);
      expect(res).toEqual({
        testFile: 'src/only-test.test.ts',
        srcFile: undefined,
      });
    });

    it('throws helpful error if target test file cannot be found', () => {
      const exists = () => false;
      expect(() => resolveTarget('unknown', exists)).toThrow('Could not find test file for "unknown"');
    });

    it('resolves when test file exists even if no 1-to-1 src file exists', () => {
      const exists = (p: string) => p === 'src/integration.test.ts';
      const res = resolveTarget('src/integration.test.ts', exists);
      expect(res).toEqual({
        testFile: 'src/integration.test.ts',
        srcFile: undefined,
      });
    });
  });

  describe('buildVitestArgs', () => {
    it('constructs scoped coverage vitest command', () => {
      const args = buildVitestArgs({ testFile: 'src/rendermode.test.ts', srcFile: 'src/rendermode.ts' });
      expect(args).toEqual([
        'run',
        'src/rendermode.test.ts',
        '--coverage',
        '--coverage.include=src/rendermode.ts',
      ]);
    });

    it('constructs vitest command without coverage when srcFile is missing', () => {
      const args = buildVitestArgs({ testFile: 'src/integration.test.ts' });
      expect(args).toEqual(['run', 'src/integration.test.ts']);
    });

    it('forwards additional vitest flags', () => {
      const args = buildVitestArgs(
        { testFile: 'src/rendermode.test.ts', srcFile: 'src/rendermode.ts' },
        { extraArgs: ['--watch', '-t', 'cycles'] },
      );
      expect(args).toEqual([
        'run',
        'src/rendermode.test.ts',
        '--coverage',
        '--coverage.include=src/rendermode.ts',
        '--watch',
        '-t',
        'cycles',
      ]);
    });

    it('disables coverage when explicitly asked', () => {
      const args = buildVitestArgs(
        { testFile: 'src/rendermode.test.ts', srcFile: 'src/rendermode.ts' },
        { coverage: false },
      );
      expect(args).toEqual(['run', 'src/rendermode.test.ts']);
    });
  });

  describe('runVitest', () => {
    it('invokes spawner and returns status', () => {
      const spawner = vi.fn().mockReturnValue({ status: 0 });
      const code = runVitest('vitest', ['run'], spawner);
      expect(code).toBe(0);
      expect(spawner).toHaveBeenCalledWith('vitest', ['run'], { stdio: 'inherit' });
    });

    it('defaults status to 0 when status is null', () => {
      const spawner = vi.fn().mockReturnValue({ status: null });
      const code = runVitest('vitest', ['run'], spawner);
      expect(code).toBe(0);
    });
  });

  describe('main', () => {
    it('executes runner with resolved args and returns exit code', () => {
      const runner = vi.fn().mockReturnValue(0);
      const exists = (p: string) => ['src/rendermode.test.ts', 'src/rendermode.ts'].includes(p);
      const code = main(['src/rendermode.test.ts'], runner, exists);
      expect(code).toBe(0);
      expect(runner).toHaveBeenCalledWith(
        'vitest',
        ['run', 'src/rendermode.test.ts', '--coverage', '--coverage.include=src/rendermode.ts'],
      );
    });

    it('prints help and exits with error code 1 when no arguments provided', () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const runner = vi.fn();
      const code = main([], runner);
      expect(code).toBe(1);
      expect(runner).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      log.mockRestore();
    });

    it('catches resolution errors, logs and returns code 1', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const runner = vi.fn();
      const exists = () => false;
      const code = main(['nonexistent'], runner, exists);
      expect(code).toBe(1);
      expect(runner).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not find test file'));
      error.mockRestore();
    });
  });
});

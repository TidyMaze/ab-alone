import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheName } from '../src/offline';

// The second vite build, the one that bundles src/sw.ts, is replaced by a spy: the test reads the options it gets.
const vite = vi.hoisted(() => ({ build: vi.fn(async (_options: unknown) => {}) }));
vi.mock('vite', () => vite);
// @ts-expect-error plain Node script, no type declarations
const { offlineApp } = await import('./offline-app.mjs');

const SHEET = 'https://fonts.googleapis.com/css2?family=Rajdhani&amp;display=swap';
let root = '';
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vite.build.mockClear();
});

/** A finished production build in a temporary folder: the page, a hashed script, its source map and the old sw.js. */
function built(): { plugin: ReturnType<typeof offlineApp>; outDir: string } {
  root = mkdtempSync(join(tmpdir(), 'offline-app-'));
  const outDir = join(root, 'dist');
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  writeFileSync(join(outDir, 'index.html'), `<link rel="stylesheet" href="${SHEET}">`);
  writeFileSync(join(outDir, 'assets', 'app-1.js'), 'app');
  writeFileSync(join(outDir, 'assets', 'app-1.js.map'), '{}');
  writeFileSync(join(outDir, 'sw.js'), 'old');
  const plugin = offlineApp();
  plugin.configResolved({ root, base: '/ab-alone/', build: { outDir: 'dist' } });
  return { plugin, outDir };
}

describe('offlineApp', () => {
  it('runs on the production build only', () => {
    expect(offlineApp()).toMatchObject({ name: 'offline-app', apply: 'build' });
  });

  it('bundles src/sw.ts into sw.js next to the page, with the precache list, the cache name and the font stylesheets', async () => {
    const { plugin, outDir } = built();
    await plugin.closeBundle();
    expect(vite.build).toHaveBeenCalledOnce();
    const options = vite.build.mock.calls[0]![0] as {
      root: string;
      base: string;
      define: Record<string, string>;
      build: { outDir: string; emptyOutDir: boolean; lib: { entry: string; formats: string[]; fileName: () => string } };
    };
    const sha = (data: string): string => createHash('sha256').update(data).digest('hex');
    expect(options).toMatchObject({ configFile: false, root, base: '/ab-alone/', publicDir: false });
    expect(JSON.parse(options.define.__PRECACHE__!)).toEqual(['/ab-alone/assets/app-1.js', '/ab-alone/']);
    expect(JSON.parse(options.define.__CACHE_NAME__!)).toBe(cacheName({ 'assets/app-1.js': sha('app'), 'index.html': sha(`<link rel="stylesheet" href="${SHEET}">`) }, sha));
    expect(JSON.parse(options.define.__FONT_STYLESHEETS__!)).toEqual([SHEET.replace('&amp;', '&')]);
    expect(options.build).toMatchObject({ outDir, emptyOutDir: false, lib: { entry: join(root, 'src/sw.ts'), formats: ['iife'] } });
    expect(options.build.lib.fileName()).toBe('sw.js');
  });

  it('writes nothing when the build failed', async () => {
    const { plugin } = built();
    await plugin.closeBundle(new Error('build failed'));
    expect(vite.build).not.toHaveBeenCalled();
  });
});

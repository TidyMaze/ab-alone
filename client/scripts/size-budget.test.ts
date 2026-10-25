import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { BUDGETS, main, measure, toMarkdown } from './size-budget.mjs';

const MB = 1_000_000;

// A production build as `vite build` writes it, with the gzipped size of each file.
const BUILD: Record<string, number> = {
  'index.html': 1,
  'assets/index-C-lWdAi6.js': 2,
  'assets/index-CJ7x67H-.css': 4,
  'assets/abalone_wasm_bg-eZ6LyWCB.wasm': 8,
  'icons/icon-192.png': 16,
  'assets/backdrop.png': 32, // shared texture
  'assets/deck-albedo.png': 64, // shared texture, not a deck
  'assets/deck-mess.png': 128,
  'assets/deck-mess-normal.png': 256,
  'assets/deck-cargo.png': 512,
  'assets/deck-cargo-normal.png': 1024,
  'assets/bot.worker-Bd2o7-m7.js': 2048, // loads with the first bot move, not on the first screen
  'manifest.webmanifest': 4096,
  'sw.js': 8192,
};

describe('measure', () => {
  it('sums the first screen, each deck and the whole site', () => {
    const { parts, sources } = measure(BUILD);
    expect(sources).toEqual([]);
    expect(parts).toEqual([
      { name: 'First screen', bytes: 1 + 2 + 4 + 8 + 16 + 32 + 64 + 128 + 256, budget: 5 * MB },
      { name: 'Deck mess', bytes: 128 + 256, budget: 15 * MB },
      { name: 'Deck cargo', bytes: 512 + 1024, budget: 15 * MB },
      { name: 'Deck furnace', bytes: 0, budget: 15 * MB },
      { name: 'Deck chapel', bytes: 0, budget: 15 * MB },
      { name: 'Deck bridge', bytes: 0, budget: 15 * MB },
      { name: 'Site', bytes: 16383, budget: 250 * MB },
    ]);
    expect(BUDGETS).toEqual({ firstScreen: 5 * MB, deck: 15 * MB, site: 250 * MB });
  });

  it('lists the source files that must stay out of the build', () => {
    const files = { ...BUILD, 'assets/hull.blend': 1, 'assets/hum.WAV': 1, 'a.psd': 1, 'b.kra': 1, 'c.xcf': 1 };
    expect(measure(files).sources).toEqual(['assets/hull.blend', 'assets/hum.WAV', 'a.psd', 'b.kra', 'c.xcf']);
  });
});

describe('toMarkdown', () => {
  it('writes one row per part, in MB, over budget or not', () => {
    const parts = [
      { name: 'First screen', bytes: 1_234_567, budget: 5 * MB },
      { name: 'Deck mess', bytes: 16 * MB, budget: 15 * MB },
    ];
    expect(toMarkdown(parts, [])).toBe(
      [
        '### Download size budget (gzipped, docs/specs/tech.md section 9)',
        '',
        '| Part | Size | Budget | Result |',
        '|---|---|---|---|',
        '| First screen | 1.23 MB | 5 MB | ok |',
        '| Deck mess | 16.00 MB | 15 MB | over budget |',
        '',
      ].join('\n'),
    );
  });

  it('names the source files found in the build', () => {
    expect(toMarkdown([], ['a.blend', 'b.wav'])).toContain('\nSource files in the build: a.blend, b.wav\n');
  });
});

describe('main', () => {
  let dir = '';
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}.md`, { force: true });
    vi.restoreAllMocks();
  });

  /** A build folder with these files, and the console and process.exit spied. */
  function build(files: Record<string, string>): { out: string[]; errors: string[]; exit: ReturnType<typeof vi.spyOn> } {
    dir = mkdtempSync(join(tmpdir(), 'size-budget-'));
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(join(dir, file, '..'), { recursive: true });
      writeFileSync(join(dir, file), content);
    }
    const out: string[] = [];
    const errors: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line) => void out.push(line));
    vi.spyOn(console, 'error').mockImplementation((line) => void errors.push(line));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    return { out, errors, exit };
  }

  it('prints the table of the gzipped sizes and passes under budget', () => {
    const page = 'a'.repeat(1000);
    const { out, errors, exit } = build({ 'index.html': page, 'assets/deck-mess.png': 'mess' });
    main(dir);
    const html = gzipSync(page).length;
    const mess = gzipSync('mess').length;
    expect(out).toEqual([
      toMarkdown(measure({ 'index.html': html, 'assets/deck-mess.png': mess }).parts, []),
    ]);
    expect(errors).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
  });

  it('appends the table to the run summary file when there is one', () => {
    const { out } = build({ 'index.html': 'page' });
    const summary = `${dir}.md`;
    writeFileSync(summary, 'before\n');
    main(dir, summary);
    const { parts } = measure({ 'index.html': gzipSync('page').length });
    expect(readFileSync(summary, 'utf8')).toBe(`before\n${toMarkdown(parts, [])}`);
    expect(out).toEqual([]);
  });

  it('fails over budget', () => {
    const { errors, exit } = build({ 'index.html': 'page' });
    main(dir, undefined, { firstScreen: 1, deck: MB, site: MB });
    expect(errors).toEqual(['Over the download budget: First screen.']);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('fails when the build holds a source file', () => {
    const { errors, exit } = build({ 'assets/hull.blend': 'mesh' });
    main(dir);
    expect(errors).toEqual(['Source files in the build: assets/hull.blend.']);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('runs as `bun run scripts/size-budget.mjs dist`', async () => {
    const { out, exit } = build({ 'index.html': 'page' });
    const argv = process.argv.slice();
    const summary = process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_STEP_SUMMARY;
    process.argv.splice(1, Infinity, fileURLToPath(new URL('./size-budget.mjs', import.meta.url)), dir);
    vi.resetModules();
    try {
      await import('./size-budget.mjs');
    } finally {
      process.argv.splice(0, Infinity, ...argv);
      if (summary !== undefined) process.env.GITHUB_STEP_SUMMARY = summary;
    }
    expect(out).toEqual([toMarkdown(measure({ 'index.html': gzipSync('page').length }).parts, [])]);
    expect(exit).not.toHaveBeenCalled();
  });
});

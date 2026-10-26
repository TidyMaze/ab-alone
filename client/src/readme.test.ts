import { describe, expect, it } from 'vitest';
import init, { boss_ids, boss_name } from 'abalone-wasm';

// Issue #708: the "The game" section of README.md names every boss the engine lists, so a new boss cannot ship
// without its README line. Node's fetch cannot read a file:// URL, so the test reads the files itself, with node:fs
// imported untyped: the client has no Node types.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
await init({ module_or_path: await readFile(new URL('../../crates/abalone-wasm/pkg/abalone_wasm_bg.wasm', import.meta.url)) });
const readme = new TextDecoder().decode(await readFile(new URL('../../README.md', import.meta.url)));
const theGame = readme.split('\n## ').find((section) => section.startsWith('The game\n'))!;

describe('README.md', () => {
  it('has a "The game" section', () => {
    expect(theGame).toBeDefined();
  });

  it.each(boss_ids())('names the boss %s in "The game"', (id) => {
    expect(theGame).toContain(boss_name(id)!);
  });

  it('marks Ranked as playable in "The game" (#711)', () => {
    const rankedRow = theGame.split('\n').find((line) => line.includes('**Ranked**'));
    expect(rankedRow).toContain('✅ playable');
  });
});

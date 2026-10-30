import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { OUTPUT, SOURCE, packModel } from './pack-models.mjs';

/** The JSON chunk of a .glb: its header is 12 bytes, then the chunk length, its type, and the JSON. */
const json = (glb: Buffer): { extensionsRequired?: string[] } =>
  JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));

const PUBLIC = new URL('../public/', import.meta.url);
const models = (dir: URL): string[] =>
  readdirSync(dir, { recursive: true }).map(String).filter((file) => file.endsWith('.glb'));

describe('pack-models', () => {
  it('ships every glTF model of the page meshopt-compressed (#61)', () => {
    expect(models(PUBLIC)).toEqual(['assets/pbr/openworld.glb', 'assets/pbr/spaceship-bay.glb']);
    for (const file of models(PUBLIC)) {
      expect(json(readFileSync(new URL(file, PUBLIC))).extensionsRequired).toContain('EXT_meshopt_compression');
    }
  });

  it('keeps the committed models identical to the packed sources, which stay out of public/', async () => {
    expect(models(SOURCE)).toEqual(['openworld.glb', 'spaceship-bay.glb']);
    for (const name of models(SOURCE)) {
      expect(readFileSync(new URL(name, OUTPUT))).toEqual(await packModel(readFileSync(new URL(name, SOURCE))));
    }
  });

  it('runs as `bun run scripts/pack-models.mjs`', async () => {
    const written = new Map<string, Buffer>();
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      writeFileSync: (url: URL, buf: Buffer) => written.set(fileURLToPath(url), buf),
    }));
    const log: unknown[][] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...line) => void log.push(line));
    const argv = process.argv[1];
    process.argv[1] = fileURLToPath(new URL('./pack-models.mjs', import.meta.url)); // as `bun run scripts/pack-models.mjs`
    vi.resetModules();
    try {
      await import('./pack-models.mjs');
    } finally {
      process.argv[1] = argv;
      vi.doUnmock('node:fs');
      spy.mockRestore();
    }
    const files = ['openworld.glb', 'spaceship-bay.glb'].map((name) => fileURLToPath(new URL(name, OUTPUT)));
    expect([...written.keys()]).toEqual(files);
    for (const file of files) expect(written.get(file)).toEqual(readFileSync(file));
    expect(log).toEqual([['public/assets/pbr/openworld.glb'], ['public/assets/pbr/spaceship-bay.glb']]);
  });
});

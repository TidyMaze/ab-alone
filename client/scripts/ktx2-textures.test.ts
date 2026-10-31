import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import jpeg from 'jpeg-js';
// @ts-expect-error plain Node script, no type declarations
import { png } from './gen-assets.mjs';
// @ts-expect-error plain Node script, no type declarations
import { decode, encode, inWorkers, ktx2Textures, settings, textureFiles } from './ktx2-textures.mjs';

// A small RGB image, 8x8, as PNG and as JPG.
const PIXELS = Uint8Array.from({ length: 8 * 8 * 3 }, (_, i) => (i * 37) % 256);
const PNG_FILE: Buffer = png(8, 8, 3, PIXELS);
const JPG_FILE: Buffer = jpeg.encode({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 128) }, 90).data;

// The KTX2 header (KTX-Software spec, section 3): the identifier, then little-endian fields.
const KTX2_ID = 'ab4b5458203230bb0d0a1a0a';
const header = (ktx2: Uint8Array) => {
  const view = new DataView(ktx2.buffer, ktx2.byteOffset, ktx2.byteLength);
  const dfd = view.getUint32(48, true);
  return {
    id: Buffer.from(ktx2.subarray(0, 12)).toString('hex'),
    width: view.getUint32(20, true),
    height: view.getUint32(24, true),
    levels: view.getUint32(40, true),
    // 1 BasisLZ (ETC1S), 2 Zstandard (UASTC here).
    supercompression: view.getUint32(44, true),
    // The transfer function of the data format descriptor's basic block: 1 linear, 2 sRGB.
    transfer: ktx2[dfd + 14],
  };
};

let dirs: string[] = [];
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ktx2-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('settings', () => {
  const common = { generateMipmap: true, isYFlip: true, isKTX2File: true };

  it('encodes a normal map in UASTC, with RDO and Zstandard, linear', () => {
    for (const file of ['deck-mess-normal.png', 'shell-normal.png', 'pbr/grate-normal.png']) {
      expect(settings(file)).toEqual({
        ...common,
        isUASTC: true,
        isNormalMap: true,
        enableRDO: true,
        needSupercompression: true,
        isPerceptual: false,
        isSetKTX2SRGBTransferFunc: false,
      });
    }
  });

  it('encodes a colour map in ETC1S, sRGB', () => {
    // An emission map is a colour (the lava's glow), not a data map.
    for (const file of ['backdrop.png', 'deck-albedo.png', 'deck-mess.png', 'deck-bridge.png', 'pbr/grate-albedo.jpg', 'pbr/skin-Lava002-emission.jpg']) {
      expect(settings(file)).toEqual({ ...common, isUASTC: false, isPerceptual: true, isSetKTX2SRGBTransferFunc: true });
    }
  });

  it('encodes a data map in ETC1S, linear', () => {
    // `deck-mess-roughness.png` starts like the Mess albedo `deck-mess.png`, and is not a colour map.
    const data = ['deck-roughness.png', 'deck-mess-roughness.png', 'crack-decal.png', 'pbr/grate-roughness.png', 'pbr/grate-displacement.png'];
    for (const file of [...data, 'pbr/board-metalness.jpg', 'pbr/grate-metalness.jpg', 'pbr/deck-pbr-ao.jpg', 'pbr/bulkhead-ao.jpg']) {
      expect(settings(file)).toEqual({ ...common, isUASTC: false, isPerceptual: false, isSetKTX2SRGBTransferFunc: false });
    }
  });
});

describe('decode', () => {
  it('reads a PNG as RGBA pixels', () => {
    const { width, height, data } = decode(PNG_FILE, 'a.png');
    expect([width, height, data.length]).toEqual([8, 8, 8 * 8 * 4]);
    expect([...data.subarray(4, 8)]).toEqual([...PIXELS.subarray(3, 6), 255]);
  });

  it('reads a JPG as RGBA pixels', () => {
    const { width, height, data } = decode(JPG_FILE, 'pbr/a.jpg');
    expect([width, height, data.length]).toEqual([8, 8, 8 * 8 * 4]);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[3]).toBe(255);
  });
});

describe('encode', () => {
  it('writes an ETC1S KTX2 with its mipmaps, sRGB for a colour map', async () => {
    const ktx2 = await encode(PNG_FILE, 'deck-mess.png', temp());
    expect(header(ktx2)).toEqual({ id: KTX2_ID, width: 8, height: 8, levels: 4, supercompression: 1, transfer: 2 });
  });

  it('writes a UASTC KTX2, linear, for a normal map', async () => {
    const ktx2 = await encode(PNG_FILE, 'deck-mess-normal.png', temp());
    expect(header(ktx2)).toEqual({ id: KTX2_ID, width: 8, height: 8, levels: 4, supercompression: 2, transfer: 1 });
  });

  it('keeps each output in the cache, by its source and settings, and reads it back from there', async () => {
    const cache = join(temp(), 'nested');
    const first = await encode(JPG_FILE, 'pbr/a.jpg', cache);
    expect(header(first).transfer).toBe(1);
    const [file] = readdirSync(cache);
    expect(file).toMatch(/^[0-9a-f]{64}\.ktx2$/);
    expect(readFileSync(join(cache, file!))).toEqual(first);
    writeFileSync(join(cache, file!), 'cached');
    expect((await encode(JPG_FILE, 'pbr/a.jpg', cache)).toString()).toBe('cached');
    expect(header(await encode(JPG_FILE, 'pbr/a-albedo.jpg', cache)).transfer).toBe(2); // other settings, other key
  });
});

/** A sources folder: two textures at the top, one in pbr/, and a file that is not a texture. */
function sources(): string {
  const dir = temp();
  mkdirSync(join(dir, 'pbr'));
  writeFileSync(join(dir, 'deck-mess.png'), PNG_FILE);
  writeFileSync(join(dir, 'backdrop.png'), PNG_FILE);
  writeFileSync(join(dir, 'pbr', 'grate-albedo.jpg'), JPG_FILE);
  writeFileSync(join(dir, 'README.txt'), 'not a texture');
  return dir;
}

describe('textureFiles', () => {
  it('gives each texture as KTX2 under assets/, at its path', async () => {
    const cache = temp();
    const files: Map<string, Buffer> = await textureFiles(sources(), cache);
    expect([...files.keys()]).toEqual(['assets/backdrop.ktx2', 'assets/deck-mess.ktx2', 'assets/pbr/grate-albedo.ktx2']);
    expect(files.get('assets/pbr/grate-albedo.ktx2')).toEqual(await encode(JPG_FILE, 'pbr/grate-albedo.jpg', cache));
  });
});

describe('inWorkers', () => {
  // A worker that doubles `n` and says which thread it is.
  const echo = (): URL => {
    const script = join(temp(), 'echo.mjs');
    writeFileSync(script, "import { parentPort, threadId } from 'node:worker_threads';\nparentPort.on('message', (m) => parentPort.postMessage({ n: m.n * 2, threadId }));\n");
    return pathToFileURL(script);
  };

  it('spreads the jobs over `size` threads at once, each reply to its own job', async () => {
    const done: [number, { n: number; threadId: number }][] = [];
    await inWorkers([{ n: 1 }, { n: 2 }, { n: 3 }], 2, (job: { n: number }, reply: { n: number; threadId: number }) => done.push([job.n, reply]), echo());
    expect(done.map(([n, r]) => [n, r.n]).sort()).toEqual([[1, 2], [2, 4], [3, 6]]);
    expect(new Set(done.map(([, r]) => r.threadId)).size).toBe(2);
  });

  it('starts no thread when there is nothing to encode, and fails when a thread fails', async () => {
    const done = vi.fn();
    await inWorkers([], 4, done, new URL('file:///nowhere.mjs'));
    expect(done).not.toHaveBeenCalled();
    await expect(inWorkers([{ n: 1 }], 1, done, new URL('file:///nowhere.mjs'))).rejects.toThrow();
  });
});

describe('ktx2Textures', () => {
  type Handler = (req: { url: string }, res: { end: (body: Buffer) => void }, next: () => void) => void;

  it('runs in the dev server and the build, not in vitest', () => {
    const plugin = ktx2Textures();
    expect(plugin.name).toBe('ktx2-textures');
    expect(plugin.apply({}, { command: 'serve', mode: 'test' })).toBe(false);
    expect(plugin.apply({}, { command: 'serve', mode: 'development' })).toBe(true);
    expect(plugin.apply({}, { command: 'serve', mode: 'e2e' })).toBe(true);
    expect(plugin.apply({}, { command: 'build', mode: 'production' })).toBe(true);
  });

  it('serves the files in the dev server, then writes the same ones in the build, encoded once', async () => {
    const cache = temp();
    const plugin = ktx2Textures(sources(), cache);
    let handler: Handler | null = null;
    await plugin.configureServer({ middlewares: { use: (fn: Handler) => (handler = fn) } });

    const end = vi.fn();
    const next = vi.fn();
    handler!({ url: '/assets/pbr/grate-albedo.ktx2?v=1' }, { end }, next);
    expect(header(end.mock.calls[0]![0]).transfer).toBe(2);
    handler!({ url: '/assets/deck-mess.ktx2' }, { end }, next);
    expect(header(end.mock.calls[1]![0]).supercompression).toBe(1);
    expect(next).not.toHaveBeenCalled();
    handler!({ url: '/assets/deck-mess.png' }, { end }, next); // a source is not served
    handler!({ url: '/index.html' }, { end }, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);

    rmSync(cache, { recursive: true }); // the build reuses what the server encoded
    const emitFile = vi.fn();
    await plugin.generateBundle.call({ emitFile });
    expect(emitFile.mock.calls.map(([asset]) => [asset.type, asset.fileName])).toEqual([
      ['asset', 'assets/backdrop.ktx2'],
      ['asset', 'assets/deck-mess.ktx2'],
      ['asset', 'assets/pbr/grate-albedo.ktx2'],
    ]);
    expect(emitFile.mock.calls[1]![0].source).toEqual(end.mock.calls[1]![0]);
  });
});

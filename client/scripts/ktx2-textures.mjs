// Vite plugin of the KTX2 textures (#700, #61). The texture sources are the PNG and JPG files under client/textures/
// (made by gen-assets.mjs, or by hand for the bay), never in the build. Each one ships as `assets/<its path>.ktx2`
// (Basis Universal): a normal map in UASTC (with RDO and Zstandard), a colour or data map in ETC1S, each with its mipmaps
// and stored upside down, as TextureLoader flipped them (a compressed texture cannot be flipped at upload). The dev
// server serves them, the build writes them, so the offline app precaches them. KTX2Loader's transcoder needs nothing
// here: Vite serves it from node_modules and the build writes it as a hashed asset, like the wasm.
// The encoder is ktx2-encoder, Basis Universal built to WebAssembly: the same bytes on Linux and macOS, nothing to
// install. A full encode takes about a minute: each output is cached by the hash of its source and settings in
// ~/.cache/ab-alone-ktx2/, shared by every checkout (and kept between CI runs).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { encodeToKTX2 } from 'ktx2-encoder';
import { PNG } from 'pngjs';
import { DECK_NAMES } from '../src/deck.ts';

const SOURCES = fileURLToPath(new URL('../textures/', import.meta.url));
const CACHE = join(homedir(), '.cache', 'ab-alone-ktx2');
const ENCODER = JSON.parse(readFileSync(new URL('../node_modules/ktx2-encoder/package.json', import.meta.url), 'utf8')).version;
// The colour maps, in sRGB: the backdrop, the albedos and each deck's cells (`deck-cargo.png`).
const COLOUR = new RegExp(`^(backdrop|.*-albedo|deck-(${DECK_NAMES.join('|')}))\\.`);

/** The encoder settings of a source file, from its name. */
export function settings(file) {
  const common = { generateMipmap: true, isYFlip: true, isKTX2File: true };
  const name = basename(file);
  if (name.includes('-normal.')) {
    return {
      ...common,
      isUASTC: true,
      isNormalMap: true,
      enableRDO: true,
      needSupercompression: true,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
    };
  }
  const srgb = COLOUR.test(name);
  return { ...common, isUASTC: false, isPerceptual: srgb, isSetKTX2SRGBTransferFunc: srgb };
}

/** The RGBA pixels of a PNG or JPG file. */
export function decode(bytes, file) {
  const { width, height, data } = file.endsWith('.jpg')
    ? jpeg.decode(bytes, { useTArray: true })
    : PNG.sync.read(Buffer.from(bytes));
  return { width, height, data: new Uint8Array(data) };
}

/** A source file as KTX2, from the cache when it holds it. */
export async function encode(bytes, file, cache) {
  const options = settings(file);
  const key = createHash('sha256').update(`${ENCODER} ${JSON.stringify(options)}\n`).update(bytes).digest('hex');
  const cached = join(cache, `${key}.ktx2`);
  if (existsSync(cached)) return readFileSync(cached);
  const ktx2 = Buffer.from(await encodeToKTX2(new Uint8Array(bytes), { ...options, imageDecoder: async (b) => decode(b, file) }));
  // Written then renamed: the dev server and a build may encode the same file at once.
  mkdirSync(cache, { recursive: true });
  writeFileSync(`${cached}.${process.pid}`, ktx2);
  renameSync(`${cached}.${process.pid}`, cached);
  return ktx2;
}

/** Every texture as KTX2, by its path in the build. */
export async function textureFiles(sources, cache) {
  const files = new Map();
  const textures = readdirSync(sources, { recursive: true }).map(String).filter((f) => /\.(png|jpg)$/.test(f));
  for (const file of textures.sort()) {
    files.set(`assets/${file.replace(/\.\w+$/, '.ktx2')}`, await encode(readFileSync(join(sources, file)), file, cache));
  }
  return files;
}

export function ktx2Textures(sources = SOURCES, cache = CACHE) {
  let files = null;
  const load = () => (files ??= textureFiles(sources, cache));
  return {
    name: 'ktx2-textures',
    // Not in vitest: it starts a dev server too, and no unit test needs the textures.
    apply: (_config, { mode }) => mode !== 'test',
    async configureServer(server) {
      const served = await load();
      server.middlewares.use((req, res, next) => {
        const file = served.get(req.url.split('?')[0].slice(1));
        if (file) res.end(file);
        else next();
      });
    },
    async generateBundle() {
      for (const [fileName, source] of await load()) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}

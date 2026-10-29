// Vite plugin of the KTX2 textures (#700, #61). The texture sources are the PNG and JPG files under client/textures/
// (made by gen-assets.mjs, or by hand for the bay), never in the build. Each one ships as `assets/<its path>.ktx2`
// (Basis Universal): a normal map in UASTC (with RDO and Zstandard), a colour or data map in ETC1S, each with its mipmaps
// and stored upside down, as TextureLoader flipped them (a compressed texture cannot be flipped at upload). The dev
// server serves them, the build writes them, so the offline app precaches them. KTX2Loader's transcoder needs nothing
// here: Vite serves it from node_modules and the build writes it as a hashed asset, like the wasm.
// The encoder is ktx2-encoder, Basis Universal built to WebAssembly: the same bytes on Linux and macOS, nothing to
// install. The textures not in the cache encode side by side, one thread per core (112 s on one thread for a full
// encode); each output is cached by the hash of its source and settings in ~/.cache/ab-alone-ktx2/, shared by every
// checkout (and kept between CI runs).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { DECK_NAMES } from '../src/deck.ts';
import { decode, encodeBytes } from './ktx2-encode.mjs';

export { decode };

const SOURCES = fileURLToPath(new URL('../textures/', import.meta.url));
const CACHE = join(homedir(), '.cache', 'ab-alone-ktx2');
const ENCODER = JSON.parse(readFileSync(new URL('../node_modules/ktx2-encoder/package.json', import.meta.url), 'utf8')).version;
// The colour maps, in sRGB: the backdrop, the albedos, the emission maps and each deck's cells (`deck-cargo.png`).
const COLOUR = new RegExp(`^(backdrop|.*-(albedo|emission)|deck-(${DECK_NAMES.join('|')}))\\.`);

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

/** Where a source's KTX2 is cached: by the encoder's version, the settings and the source bytes. */
const cachePath = (bytes, options, cache) =>
  join(cache, `${createHash('sha256').update(`${ENCODER} ${JSON.stringify(options)}\n`).update(bytes).digest('hex')}.ktx2`);

/** Keeps a KTX2 in the cache, written then renamed: the dev server and a build may encode the same file at once. */
function store(cached, ktx2) {
  mkdirSync(join(cached, '..'), { recursive: true });
  writeFileSync(`${cached}.${process.pid}`, ktx2);
  renameSync(`${cached}.${process.pid}`, cached);
  return ktx2;
}

/** A source file as KTX2, from the cache when it holds it, else encoded in this thread. */
export async function encode(bytes, file, cache) {
  const options = settings(file);
  const cached = cachePath(bytes, options, cache);
  return existsSync(cached) ? readFileSync(cached) : store(cached, await encodeBytes(bytes, file, options));
}

/** Sends each job to a thread of `script`, `size` threads at once, and hands each reply to `done` with its job. */
export async function inWorkers(jobs, size, done, script = new URL('./ktx2-worker.mjs', import.meta.url)) {
  const queue = [...jobs];
  const thread = async () => {
    const worker = new Worker(script);
    try {
      for (let job; (job = queue.shift()); ) {
        const reply = await new Promise((resolve, reject) => {
          worker.once('error', reject);
          worker.once('message', resolve);
          worker.postMessage(job);
        });
        worker.removeAllListeners('error');
        done(job, reply);
      }
    } finally {
      await worker.terminate();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, thread));
}

/** Every texture as KTX2, by its path in the build: the ones not in the cache encoded one per core. */
export async function textureFiles(sources, cache, threads = availableParallelism()) {
  const textures = readdirSync(sources, { recursive: true }).map(String).filter((f) => /\.(png|jpg)$/.test(f)).sort();
  const jobs = textures.map((file) => {
    const bytes = readFileSync(join(sources, file));
    const options = settings(file);
    return { file, bytes, options, cached: cachePath(bytes, options, cache) };
  });
  await inWorkers(jobs.filter((job) => !existsSync(job.cached)), threads, (job, ktx2) => store(job.cached, Buffer.from(ktx2)));
  return new Map(jobs.map((job) => [`assets/${job.file.replace(/\.\w+$/, '.ktx2')}`, readFileSync(job.cached)]));
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

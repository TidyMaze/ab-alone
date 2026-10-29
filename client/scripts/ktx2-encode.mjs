// The KTX2 encode of one texture (ktx2-textures.mjs), without the TypeScript imports of the plugin: the encode threads
// (ktx2-worker.mjs) load it, and Node 22 runs a worker without type stripping.
import jpeg from 'jpeg-js';
import { encodeToKTX2 } from 'ktx2-encoder';
import { PNG } from 'pngjs';

/** The RGBA pixels of a PNG or JPG file. */
export function decode(bytes, file) {
  const { width, height, data } = file.endsWith('.jpg')
    ? jpeg.decode(bytes, { useTArray: true })
    : PNG.sync.read(Buffer.from(bytes));
  return { width, height, data: new Uint8Array(data) };
}

/** A source file's bytes as KTX2 with these encoder settings (ktx2-textures.mjs `settings`). */
export async function encodeBytes(bytes, file, options) {
  return Buffer.from(await encodeToKTX2(new Uint8Array(bytes), { ...options, imageDecoder: async (b) => decode(b, file) }));
}

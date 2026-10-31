// The KTX2 encode of one texture (ktx2-textures.mjs), without the TypeScript imports of the plugin: the encode threads
// (ktx2-worker.mjs) load it, and Node 22 runs a worker without type stripping.
import jpeg from 'jpeg-js';
import { encodeToKTX2 } from 'ktx2-encoder';
import { PNG } from 'pngjs';

/** A normal map halved until it is at most `max` texels wide: 4 texels averaged, the vector renormalised (flat when null). */
function shrink({ width, height, data }, max) {
  while (width > max) {
    const [w, h] = [width >> 1, height >> 1];
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = [0, 0, 0];
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const i = ((2 * y + dy) * width + 2 * x + dx) * 4;
          for (let c = 0; c < 3; c++) v[c] += data[i + c] / 255 * 2 - 1;
        }
        const length = Math.hypot(...v);
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(((length ? v[c] / length : c === 2 ? 1 : 0) + 1) / 2 * 255);
        out[o + 3] = 255;
      }
    }
    [width, height, data] = [w, h, out];
  }
  return { width, height, data };
}

/** The RGBA pixels of a PNG or JPG file, a normal map shrunk to `max` texels wide when it is given. */
export function decode(bytes, file, max = Infinity) {
  const { width, height, data } = file.endsWith('.jpg')
    ? jpeg.decode(bytes, { useTArray: true })
    : PNG.sync.read(Buffer.from(bytes));
  return shrink({ width, height, data: new Uint8Array(data) }, max);
}

/** A source file's bytes as KTX2 with these encoder settings (ktx2-textures.mjs `settings`). */
export async function encodeBytes(bytes, file, options) {
  return Buffer.from(await encodeToKTX2(new Uint8Array(bytes), { ...options, imageDecoder: async (b) => decode(b, file, options.maxSize) }));
}

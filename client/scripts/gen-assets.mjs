// Generates the board and marble textures as PNG files under client/public/assets/.
// Pure Node (zlib only), no download, no secret. Same seed, same bytes.
// Run: node scripts/gen-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export const SEED = 89;
export const ASSET_NAMES = [
  'deck-albedo.png',
  'deck-roughness.png',
  'marble-normal.png',
  'backdrop.png',
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise on a size x size grid: lattice period divides size, so edges wrap.
function noise(size, period, rand) {
  const lat = Array.from({ length: period * period }, rand);
  const at = (x, y) => lat[(y % period) * period + (x % period)];
  const out = new Float32Array(size * size);
  const step = size / period;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / step, fy = y / step;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      out[y * size + x] = top * (1 - sy) + bot * sy;
    }
  }
  return out;
}

// Fractal sum of tileable octaves, values in 0..1.
function fbm(size, rand, periods = [4, 8, 16, 32]) {
  const out = new Float32Array(size * size);
  let norm = 0;
  periods.forEach((p, i) => {
    const w = 1 / 2 ** i;
    norm += w;
    noise(size, p, rand).forEach((v, k) => (out[k] += v * w));
  });
  return out.map((v) => v / norm);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// channels: 1 = grey, 3 = RGB. pixels: Uint8 array of w*h*channels.
function png(w, h, channels, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 1 ? 0 : 2;
  const stride = w * channels;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Brushed, pitted oxidized steel (world.md palette: steel #4a5258, rust #7a3b1d).
function deck(size, rand) {
  const grain = fbm(size, rand);
  const rust = fbm(size, rand, [2, 4, 8]);
  const pits = fbm(size, rand, [32, 64]);
  const streak = noise(size, size / 2, rand); // fine horizontal brushing
  const albedo = new Uint8Array(size * size * 3);
  const rough = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const brush = streak[(y * size + (x * 7) % size) % streak.length] - 0.5;
      const rustMix = Math.max(0, (rust[i] - 0.68) * 2.2);
      const pit = pits[i] > 0.66 ? 0.6 : 1;
      const shade = (0.8 + grain[i] * 0.45 + brush * 0.12) * pit;
      albedo[i * 3] = clamp((0x4a * (1 - rustMix) + 0x7a * rustMix) * shade);
      albedo[i * 3 + 1] = clamp((0x52 * (1 - rustMix) + 0x3b * rustMix) * shade);
      albedo[i * 3 + 2] = clamp((0x58 * (1 - rustMix) + 0x1d * rustMix) * shade);
      rough[i] = clamp(150 + grain[i] * 60 + rustMix * 40 - brush * 40);
    }
  }
  return [png(size, size, 3, albedo), png(size, size, 1, rough)];
}

// Tangent-space normal map from a height field: micro pitting for the shell, soft for the glass.
function marbleNormal(size, rand) {
  const h = fbm(size, rand, [8, 16, 32]);
  const px = new Uint8Array(size * size * 3);
  const k = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x + size - 1) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y + size - 1) % size) * size + x], d = h[((y + 1) % size) * size + x];
      const nx = (l - r) * k, ny = (u - d) * k, inv = 1 / Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 3;
      px[o] = clamp((nx * inv * 0.5 + 0.5) * 255);
      px[o + 1] = clamp((ny * inv * 0.5 + 0.5) * 255);
      px[o + 2] = clamp((inv * 0.5 + 0.5) * 255);
    }
  }
  return png(size, size, 3, px);
}

// Near-black base (#0b0d0f) with a vignette, cold haze and faint grime.
function backdrop(w, h, rand) {
  const grime = fbm(w, rand, [4, 8, 16]);
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x / w - 0.5, dy = y / h - 0.5;
      const vig = Math.max(0, 1 - Math.hypot(dx, dy) * 1.6);
      const g = grime[y * w + x];
      const o = (y * w + x) * 3;
      px[o] = clamp(11 + vig * 10 + g * 6);
      px[o + 1] = clamp(13 + vig * 13 + g * 7);
      px[o + 2] = clamp(15 + vig * 18 + g * 8);
    }
  }
  return png(w, h, 3, px);
}

export function generateAssets(seed) {
  const rand = rng(seed);
  const [albedo, rough] = deck(256, rand);
  return new Map([
    ['deck-albedo.png', albedo],
    ['deck-roughness.png', rough],
    ['marble-normal.png', marbleNormal(128, rand)],
    ['backdrop.png', backdrop(256, 256, rand)],
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../public/assets/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, buf] of generateAssets(SEED)) {
    writeFileSync(new URL(name, dir), buf);
    console.log(`${name} ${buf.length} bytes`);
  }
}

// Generates the board, marble and tell textures as PNG files under client/textures/: the sources that
// scripts/ktx2-textures.mjs encodes to KTX2 (#700).
// Pure Node (zlib only), no download, no secret. Same seed, same bytes.
// Run: node scripts/gen-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export const SEED = 89;
export const ASSET_NAMES = [
  'deck-albedo.png',
  'deck-roughness.png',
  'shell-normal.png',
  'backdrop.png',
  'crack-decal.png',
  'deck-cargo.png',
  'deck-furnace.png',
  'deck-chapel.png',
  'deck-bridge.png',
  'deck-cargo-normal.png',
  'deck-furnace-normal.png',
  'deck-chapel-normal.png',
  'deck-bridge-normal.png',
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
export function png(w, h, channels, pixels) {
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

// Brushed, pitted oxidized steel (world.md palette: steel #4a5258, rust #7a3b1d), lightened LIGHTEN times so both
// marbles, the dark shell and the smoked glass, read 3:1 against it under the low-key lamp (#344). The frame's plate
// and rim tints in main.ts are lowered by the same factor, so the frame keeps its look.
const LIGHTEN = 1.9;
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
      const shade = (0.8 + grain[i] * 0.45 + brush * 0.12) * pit * LIGHTEN;
      albedo[i * 3] = clamp((0x4a * (1 - rustMix) + 0x7a * rustMix) * shade);
      albedo[i * 3 + 1] = clamp((0x52 * (1 - rustMix) + 0x3b * rustMix) * shade);
      albedo[i * 3 + 2] = clamp((0x58 * (1 - rustMix) + 0x1d * rustMix) * shade);
      rough[i] = clamp(150 + grain[i] * 60 + rustMix * 40 - brush * 40);
    }
  }
  return [png(size, size, 3, albedo), png(size, size, 1, rough), albedo];
}

// Tangent-space normal map of the enemy shell, ridged like a scarab (world.md section 5): rounded ridges with sharp
// grooves, RIDGES across the width (the sphere's u: they run from pole to pole), wavering a little down the height.
const RIDGES = 16;
function shellNormal(size, rand) {
  const waver = noise(size, 4, rand);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x / size) * RIDGES + (waver[y * size] - 0.5) * 0.6;
      h[y * size + x] = Math.sqrt(Math.abs(Math.sin(Math.PI * t)));
    }
  }
  const px = new Uint8Array(size * size * 3);
  const k = 6;
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

// Background (#432): ore hauler viewport into the void, with the Hollow Moon arc,
// cold cyan ore dust drifts, warm sodium backscatter from ship gantries, and industrial framing.
function backdrop(w, h, rand) {
  const grime = fbm(w, rand, [4, 8, 16]);
  const dust = fbm(w, rand, [2, 6, 12]);
  const px = new Uint8Array(w * h * 3);
  const moonX = w * 0.72, moonY = h * 0.22, moonR = w * 0.42;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const dx = u - 0.5, dy = v - 0.5;
      const distCenter = Math.hypot(dx, dy);
      const vig = Math.max(0, 1 - distCenter * 1.4);
      const g = grime[y * w + x];
      const d = dust[y * w + x];

      // Deep space base: dark blue-grey (#12171b)
      let r = 18 + vig * 8 + g * 5;
      let gr = 23 + vig * 10 + g * 6;
      let b = 28 + vig * 14 + g * 8;

      // Distance to hollow moon rim
      const dMoon = Math.hypot(x - moonX, y - moonY);
      const moonDistNorm = Math.abs(dMoon - moonR) / (moonR * 0.35);
      if (moonDistNorm < 1) {
        const angle = Math.atan2(y - moonY, x - moonX);
        const crescent = Math.max(0, -Math.cos(angle - 0.75 * Math.PI));
        const arc = (1 - moonDistNorm * moonDistNorm) * crescent;
        r += arc * 14;
        gr += arc * 24;
        b += arc * 32;
      }

      // Cold cyan ore dust drift (right / top)
      const cyanDrift = Math.max(0, (u * 0.7 + (1 - v) * 0.5) - 0.3) * d;
      r += cyanDrift * 6;
      gr += cyanDrift * 16;
      b += cyanDrift * 24;

      // Warm sodium hazard glow from gantry on left
      const warmDrift = Math.max(0, ((1 - u) * 0.8 + (1 - v) * 0.4) - 0.4) * (1 - g * 0.5);
      r += warmDrift * 18;
      gr += warmDrift * 10;
      b += warmDrift * 4;

      const o = (y * w + x) * 3;
      px[o] = clamp(r);
      px[o + 1] = clamp(gr);
      px[o + 2] = clamp(b);
    }
  }
  return png(w, h, 3, px);
}

// The crack decal of The Hull and The Ballast Mind (world.md section 3: the board crumbles as the hull fails), a grey
// mask, white where the steel is split; main.ts draws it near-black on the cracked cell. A crisp fracture in a hull
// plate (#838): six fractures run from near the middle out to the rim, one in every sixth of the turn so they show round
// the marble, each a straight-edged jagged line that ends in a point and forks once or twice at a sharp angle. The
// middle is hidden by the marble, so a fracture is narrow there and widest in the ring round the marble, never fatter
// than 10 px of the 128: still 3:1 when the cell is small on screen.
const CRACKS = 6;
function crackDecal(size, rand) {
  const mask = new Float32Array(size * size);
  const c = (size - 1) / 2, rim = size / 2 - 5;
  // An anti-aliased segment tapering from `w0` to `w1` px wide, kept at its brightest where segments cross.
  const segment = (x0, y0, x1, y1, w0, w1) => {
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
    const reach = Math.max(w0, w1) + 1;
    for (let y = Math.floor(Math.min(y0, y1) - reach); y <= Math.ceil(Math.max(y0, y1) + reach); y++) {
      for (let x = Math.floor(Math.min(x0, x1) - reach); x <= Math.ceil(Math.max(x0, x1) + reach); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const width = w0 + (w1 - w0) * t;
        const v = Math.max(0, Math.min(1, width / 2 + 0.5 - Math.hypot(x - x0 - t * dx, y - y0 - t * dy)));
        mask[y * size + x] = Math.max(mask[y * size + x], v);
      }
    }
  };
  // The marble hides the middle, so a fracture is narrow there and widest in the ring round the marble, where it is
  // seen: `scale` times 3 px at the middle to 10 px at four fifths of the way to the rim.
  const widthAt = (x, y, scale) => scale * (3 + 7 * Math.min(1, Math.hypot(x - c, y - c) / (0.8 * rim)));
  // A fracture heading out along `toward` in straight runs of 10 to 16 px with small kinks; its last run narrows to a
  // 3 px point at the rim or after `steps` runs. A fork leaves at about 35 degrees at 0.6 of its parent's width.
  const crack = (x, y, toward, scale, steps, forks) => {
    for (let n = 0; n < steps; n++) {
      const angle = toward + (rand() - 0.5) * 0.5, run = 10 + rand() * 6;
      const nx = x + Math.cos(angle) * run, ny = y + Math.sin(angle) * run;
      const outside = Math.hypot(nx - c, ny - c) > rim;
      segment(x, y, nx, ny, widthAt(x, y, scale), outside ? 3 : widthAt(nx, ny, scale));
      if (outside) return;
      [x, y] = [nx, ny];
      if (forks > 0 && n > 0 && rand() < 0.45) crack(x, y, angle + (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.15), scale * 0.6, 2 + Math.floor(rand() * 2), forks - 1);
    }
  };
  const x0 = c + (rand() - 0.5) * 6, y0 = c + (rand() - 0.5) * 6;
  for (let k = 0; k < CRACKS; k++) crack(x0, y0, (k * 2 * Math.PI) / CRACKS + (rand() - 0.5) * 0.3, 1, Infinity, 1);
  // Nothing outside the cell's disc: a tip that runs past the rim is cut there.
  const inside = (i) => Math.hypot((i % size) - c, Math.floor(i / size) - c) <= size / 2 - 1;
  return png(size, size, 1, Uint8Array.from(mask, (v, i) => (inside(i) ? clamp(v * 255) : 0)));
}

// The cells' albedo of each deck (world.md section 5, #401), each a mid-tone like the steel above, so both marbles read
// 3:1 on it under the deck's own light. The frame keeps the steel. Tileable: every pattern wraps at the edges.
function deckSets(size, steel, rand) {
  const set = (fn) => {
    const px = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i++) fn(i, i % size, Math.floor(i / size)).forEach((v, k) => (px[i * 3 + k] = clamp(v)));
    return png(size, size, 3, px);
  };
  const fine = fbm(size, rand, [32, 64]);
  const broad = fbm(size, rand, [2, 4]);
  const warp = noise(size, 4, rand);
  // Worn laminate (Mess): a warm grey sheet, fine speckle, coffee rings and scratches.
  const marks = new Float32Array(size * size);
  for (let n = 0; n < 4; n++) {
    const cx = rand() * size, cy = rand() * size, r = 14 + rand() * 12;
    for (let i = 0; i < size * size; i++) {
      const dx = Math.abs((i % size) - cx), dy = Math.abs(Math.floor(i / size) - cy);
      const d = Math.hypot(Math.min(dx, size - dx), Math.min(dy, size - dy));
      marks[i] = Math.max(marks[i], Math.max(0, 1 - Math.abs(d - r) / 1.5) * 0.6);
    }
  }
  for (let n = 0; n < 24; n++) {
    let x = rand() * size, y = rand() * size;
    const a = rand() * Math.PI, len = 20 + rand() * 60;
    for (let t = 0; t < len; t++, x += Math.cos(a), y += Math.sin(a)) {
      const i = (((Math.round(y) % size) + size) % size) * size + (((Math.round(x) % size) + size) % size);
      marks[i] = Math.min(marks[i], -0.5);
    }
  }
  const mess = set((i) => {
    const shade = 0.98 + (fine[i] - 0.5) * 0.3 + (broad[i] - 0.5) * 0.08 - Math.max(0, marks[i]) * 0.25 - Math.min(0, marks[i]) * 0.25;
    return [0xa4 * shade, 0x98 * shade, 0x86 * shade];
  });
  // Ore dust on the steel plate (Cargo): rust-brown grit gathered in drifts.
  const cargo = set((i) => {
    const dust = Math.min(0.85, Math.max(0, (broad[i] - 0.4) * 2.2) * (fine[i] > 0.5 ? 1 : 0.5));
    return [0, 1, 2].map((k) => steel[i * 3 + k] * (1 - dust) + [0xa8, 0x80, 0x5c][k] * dust);
  });
  // Blackened steel (Furnace): soot clouds over the steel, a faint heat tint where it is clean.
  const furnace = set((i) => {
    const soot = Math.min(1, Math.max(0, (broad[i] - 0.42) * 2.5)) * (0.7 + fine[i] * 0.3);
    const shade = 1 - soot * 0.5;
    return [steel[i * 3] * shade * 1.06, steel[i * 3 + 1] * shade, steel[i * 3 + 2] * shade * 0.92];
  });
  // Wood and wire (Chapel): grain along the boards, two binding wires, pale wax drips.
  const chapel = set((i, x, y) => {
    const grain = Math.sin(((y + warp[i] * 24) / size) * Math.PI * 2 * 18) * 0.5 + 0.5;
    const wire = x % 128 < 2 ? 0.55 : 1;
    const wax = fine[i] > 0.8 ? 1 : 0;
    const shade = (0.9 + grain * 0.18 + (fine[i] - 0.5) * 0.1) * wire;
    return [0, 1, 2].map((k) => [0xb0, 0x8a, 0x66][k] * shade * (1 - wax) + [0xd8, 0xd0, 0xb8][k] * wax);
  });
  // Polished white-grey panel (Bridge): clean, thin seams between the panels, too tidy.
  const bridge = set((i, x, y) => {
    const seam = x % 128 === 0 || y % 128 === 0 ? 0.6 : 1;
    const shade = (1 + (fine[i] - 0.5) * 0.03) * seam;
    return [0x92 * shade, 0x98 * shade, 0x9e * shade];
  });
  return { mess, cargo, furnace, chapel, bridge };
}

export function generateAssets(seed) {
  const rand = rng(seed);
  const [albedo, rough, steel] = deck(256, rand);
  const assets = new Map([
    ['deck-albedo.png', albedo],
    ['deck-roughness.png', rough],
    ['shell-normal.png', shellNormal(256, rand)],
    ['backdrop.png', backdrop(256, 256, rand)],
    ['crack-decal.png', crackDecal(128, rand)],
  ]);
  // Their own stream, so the assets above keep their bytes (#401). The Mess cells are ambientCG Concrete036 (CC0),
  // committed by hand: still drawn here so the other decks keep their bytes, not written.
  const generated = ([name]) => name !== 'mess';
  for (const [name, buf] of Object.entries(deckSets(256, steel, rng(seed + 401))).filter(generated)) assets.set(`deck-${name}.png`, buf);
  // Tangent-space normal map per deck (#440).
  for (const [name, buf] of Object.entries(deckNormals(256, rng(seed + 440))).filter(generated)) assets.set(`deck-${name}-normal.png`, buf);
  return assets;
}

// Tangent-space normal map per deck (#440): laminate scratches, ore grit, soot-pitted steel, wood grain, panel seams.
// Tileable: edges wrap. Subtle relief so cell edge contrast stays readable (3:1 minimum against the marble).
function deckNormals(size, rand) {
  const normalFromHeight = (h, k = 2.5) => {
    const px = new Uint8Array(size * size * 3);
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
  };

  const fine = fbm(size, rand, [32, 64]);
  const warp = noise(size, 4, rand);

  // 1. Mess: laminate scratches and cup-ring lip depressions
  const hMess = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) hMess[i] = (fine[i] - 0.5) * 0.08;
  for (let n = 0; n < 32; n++) {
    let x = rand() * size, y = rand() * size;
    const a = rand() * Math.PI, len = 15 + rand() * 45;
    for (let t = 0; t < len; t++, x += Math.cos(a), y += Math.sin(a)) {
      const idx = (((Math.round(y) % size) + size) % size) * size + (((Math.round(x) % size) + size) % size);
      hMess[idx] -= 0.35;
    }
  }
  const mess = normalFromHeight(hMess, 2.0);

  // 2. Cargo: ore grit (sharp granular particulate relief on plate)
  const grit = noise(size, 64, rand);
  const hCargo = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const isSpeck = grit[i] > 0.72 ? (grit[i] - 0.72) * 1.5 : 0;
    hCargo[i] = (fine[i] - 0.5) * 0.12 + isSpeck;
  }
  const cargo = normalFromHeight(hCargo, 2.2);

  // 3. Furnace: soot-pitted steel (small crater depressions from heat pitting)
  const pits = fbm(size, rand, [16, 32, 64]);
  const hFurnace = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const pit = pits[i] > 0.65 ? -0.4 : 0;
    hFurnace[i] = (fine[i] - 0.5) * 0.1 + pit;
  }
  const furnace = normalFromHeight(hFurnace, 2.0);

  // 4. Chapel: wood grain ridges along y and raised wire seams
  const hChapel = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const grain = Math.sin(((y + warp[i] * 24) / size) * Math.PI * 2 * 18) * 0.25;
      const wire = x % 128 < 2 ? 0.35 : 0;
      hChapel[i] = grain + wire + (fine[i] - 0.5) * 0.05;
    }
  }
  const chapel = normalFromHeight(hChapel, 2.5);

  // 5. Bridge: polished flat panel with recessed perimeter seams
  const hBridge = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const seam = x % 128 === 0 || y % 128 === 0 ? -0.5 : 0;
      hBridge[i] = seam + (fine[i] - 0.5) * 0.02;
    }
  }
  const bridge = normalFromHeight(hBridge, 2.5);

  return { mess, cargo, furnace, chapel, bridge };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../textures/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, buf] of generateAssets(SEED)) {
    writeFileSync(new URL(name, dir), buf);
    console.log(`${name} ${buf.length} bytes`);
  }
}

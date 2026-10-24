// Generates the app icons (web app manifest) as PNG files under client/public/icons/.
// Pure Node, no download: a steel hex board with a rust rim and seven marbles around the player's
// cyan one, on the near-black base (world.md section 5 palette). Same code, same bytes.
// Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { png } from './gen-assets.mjs';

export const ICON_SIZES = [192, 512];

const BASE = [0x0b, 0x0d, 0x0f];
const STEEL = [0x4a, 0x52, 0x58];
const RUST = [0x7a, 0x3b, 0x1d];
const CYAN = [0x7f, 0xd6, 0xe8];
const BLACK = [0x15, 0x19, 0x1c];
const WHITE = [0xd8, 0xd4, 0xc8];

const HEX = 0.37; // board circumradius, inside the maskable safe zone (40 %)
const STEP = 0.2; // marble spacing
const BALL = 0.085; // marble radius
const SQRT3 = Math.sqrt(3);
const LIGHT = (() => {
  const l = [-0.45, -0.55, 0.7];
  const n = Math.hypot(...l);
  return l.map((c) => c / n);
})();
const HALF = (() => {
  const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const n = Math.hypot(...h);
  return h.map((c) => c / n);
})();
// The centre marble is the player's, the ring alternates the two sides, neighbours at 0, 60, ... degrees.
const MARBLES = [
  { x: 0, y: 0, color: CYAN, core: true },
  ...Array.from({ length: 6 }, (_, k) => ({
    x: STEP * Math.cos((k * Math.PI) / 3),
    y: STEP * Math.sin((k * Math.PI) / 3),
    color: k % 2 ? WHITE : BLACK,
    core: false,
  })),
];

// Colour of one sample at (x, y), the centre of the icon at (0, 0), the icon side 1, written to out.
function shade(x, y, out) {
  // Flat-top hexagon: 1 on its edge, below 1 inside.
  const hd = Math.max(Math.abs(y) / ((HEX * SQRT3) / 2), (SQRT3 * Math.abs(x) + Math.abs(y)) / (SQRT3 * HEX));
  if (hd > 1) {
    out[0] = BASE[0], out[1] = BASE[1], out[2] = BASE[2];
    return;
  }
  const rim = hd > 0.9;
  const tone = rim ? (hd > 0.98 ? 1.35 : 1 - 0.3 * y) : 1.05 - 0.6 * y;
  for (let i = 0; i < 3; i++) out[i] = (rim ? RUST : STEEL)[i] * tone;
  for (const m of MARBLES) {
    const dx = x - m.x, dy = y - m.y;
    const d = Math.hypot(dx, dy);
    if (!m.core && d > BALL && Math.hypot(dx - 0.012, dy - 0.016) < BALL * 1.05) {
      for (let i = 0; i < 3; i++) out[i] *= 0.55; // shadow
    }
    if (m.core && d > BALL && d < BALL * 1.8) {
      const glow = 0.35 * (1 - (d - BALL) / (0.8 * BALL)) ** 2;
      for (let i = 0; i < 3; i++) out[i] += CYAN[i] * glow;
    }
    if (d <= BALL) {
      const a = dx / BALL, b = dy / BALL, z = Math.sqrt(Math.max(0, 1 - a * a - b * b));
      const diffuse = Math.max(0, a * LIGHT[0] + b * LIGHT[1] + z * LIGHT[2]);
      const spec = Math.max(0, a * HALF[0] + b * HALF[1] + z * HALF[2]) ** 40 * 150;
      const k = m.core ? 0.55 + 0.5 * z : 0.35 + 0.75 * diffuse;
      for (let i = 0; i < 3; i++) out[i] = m.color[i] * k + spec;
    }
  }
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const SAMPLES = 4; // 4 x 4 samples per pixel for smooth edges

function icon(size) {
  const px = new Uint8Array(size * size * 3);
  const sample = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          shade((x + (sx + 0.5) / SAMPLES) / size - 0.5, (y + (sy + 0.5) / SAMPLES) / size - 0.5, sample);
          r += sample[0], g += sample[1], b += sample[2];
        }
      }
      const o = (y * size + x) * 3, n = SAMPLES * SAMPLES;
      px[o] = clamp(r / n), px[o + 1] = clamp(g / n), px[o + 2] = clamp(b / n);
    }
  }
  return png(size, size, 3, px);
}

export function generateIcons() {
  return new Map(ICON_SIZES.map((n) => [`icon-${n}.png`, icon(n)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../public/icons/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, buf] of generateIcons()) {
    writeFileSync(new URL(name, dir), buf);
    console.log(`${name} ${buf.length} bytes`);
  }
}

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { ASSET_NAMES, SEED, generateAssets } from './gen-assets.mjs';
import { relativeLuminance } from '../src/contrast';
import { DECK_NAMES } from '../src/deck';

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const hashAll = (assets: Map<string, Buffer>): string =>
  sha(Buffer.concat([...assets.entries()].map(([n, b]) => Buffer.concat([Buffer.from(n), b]))));
const hashes = (assets: Map<string, Buffer>): Map<string, string> => new Map([...assets].map(([n, b]) => [n, sha(b)]));

// docs/specs/tech.md section 9: the initial load stays under 5 MB gzipped. Textures get a fifth of it.
const BUDGET_BYTES = 1_000_000;

// Width, height and rows of a PNG written by png() (one IDAT chunk, filter 0 on every row), RGB or grey.
function decode(buf: Buffer, channels = 3): { w: number; h: number; rows: Buffer[] } {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const at = buf.indexOf('IDAT');
  const raw = inflateSync(buf.subarray(at + 4, at + 4 + buf.readUInt32BE(at - 4)));
  const stride = w * channels + 1;
  return { w, h, rows: Array.from({ length: h }, (_, y) => raw.subarray(y * stride + 1, (y + 1) * stride)) };
}

// A run generates every asset, the deck sets of #401 and #440 included: a few hundred ms alone, seconds when the whole
// suite runs in parallel with coverage on a loaded machine. So the tests share one run, and only the tests about runs
// themselves draw again (bug #609).
describe('gen-assets', { timeout: 20_000 }, () => {
  let assets: Map<string, Buffer>;
  beforeAll(() => {
    assets = generateAssets(SEED);
  });

  it('is deterministic: two runs with the same seed give the same hash', () => {
    expect(hashAll(generateAssets(SEED))).toBe(hashAll(assets));
  });

  it('changes when the seed changes', () => {
    expect(hashAll(generateAssets(SEED + 1))).not.toBe(hashAll(assets));
  });

  it('produces valid PNG files for every expected asset', () => {
    expect([...assets.keys()].sort()).toEqual([...ASSET_NAMES].sort());
    for (const buf of assets.values()) {
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  // Bug #609: it took 20 s on a loaded machine. Comparing the files is cheap, it must stay well under a second: hashes,
  // not a deep equality over every byte.
  it.each(ASSET_NAMES as string[])('keeps the committed %s identical to the generator output', (name) => {
    expect(sha(readFileSync(new URL(`../textures/${name}`, import.meta.url)))).toBe(sha(assets.get(name)!));
  }, 1_000);

  // docs/specs/art.md section 2: the shell's ridge normal map, 256 px at most, 64 KB at most (#293).
  it('makes a ridge normal map for the shell within 256 px and 64 KB', () => {
    const buf = assets.get('shell-normal.png')!;
    const { w, h } = decode(buf);
    expect(Math.max(w, h)).toBeLessThanOrEqual(256);
    expect(buf.length).toBeLessThanOrEqual(64 * 1024);
  });

  it('ridges the shell across its width: the x tilt turns from one side to the other many times on every row', () => {
    const { w, rows } = decode(assets.get('shell-normal.png')!);
    for (const row of rows) {
      let turns = 0;
      let last = 0; // the last tilt that was not flat
      for (let x = 0; x < w; x++) {
        const tilt = Math.sign(row[x * 3]! - 128);
        if (tilt !== 0 && last !== 0 && tilt !== last) turns++;
        if (tilt !== 0) last = tilt;
      }
      expect(turns).toBeGreaterThanOrEqual(16); // two turns a ridge, eight ridges at least around the marble
    }
  });

  // docs/specs/art.md section 2: The Hull's crack decal, a grey mask, 128 px, 16 KB at most (#355).
  it('makes a crack decal for The Hull within 128 px and 16 KB', () => {
    const buf = assets.get('crack-decal.png')!;
    const { w, h } = decode(buf, 1);
    expect([w, h]).toEqual([128, 128]);
    expect(buf.length).toBeLessThanOrEqual(16 * 1024);
  });

  // The decal lies on the whole cell, the marble covers its middle: the crack must show in the ring round the marble
  // (cell radius 0.46, marble 0.36) on every side, and stay a few lines, not a disc.
  it('cracks the decal from the middle out to the rim in every sixth of the turn, inside the disc', () => {
    const { w, rows } = decode(assets.get('crack-decal.png')!, 1);
    const c = (w - 1) / 2;
    const sixths = new Set<number>();
    let middle = false, inDisc = 0, lit = 0;
    rows.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - c, y - c) / (w / 2); // 1 at the cell's rim
        const v = row[x]!;
        if (d > 1) expect(v).toBe(0);
        else inDisc++;
        if (v < 128) continue;
        lit++;
        if (d < 0.15) middle = true;
        if (d > 0.8 && d < 0.9) sixths.add(Math.round(Math.atan2(y - c, x - c) / (Math.PI / 3) + 6) % 6);
      }
    });
    expect(middle).toBe(true);
    expect([...sixths].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lit / inDisc).toBeGreaterThan(0.04);
    expect(lit / inDisc).toBeLessThan(0.2); // hairline fractures, not blots (#838)
  });

  // #838: a crisp crack in a hull plate: it tapers from the impact out to a point at the rim, so the rim ring holds
  // a smaller share of lit pixels than the ring round the middle.
  it('tapers the cracks of the decal from the middle out to the rim (#838)', () => {
    const { w, rows } = decode(assets.get('crack-decal.png')!, 1);
    const c = (w - 1) / 2;
    const share = (from: number, to: number): number => {
      let lit = 0, all = 0;
      rows.forEach((row, y) => {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - c, y - c) / (w / 2);
          if (d < from || d >= to) continue;
          all++;
          if (row[x]! >= 128) lit++;
        }
      });
      return lit / all;
    };
    expect(share(0.15, 0.5)).toBeGreaterThan(share(0.75, 1) * 1.3);
  });

  // Task #401: each deck of docs/specs/world.md section 5 has its own albedo for the cells, with the shared roughness.
  describe('a texture set per deck (#401)', () => {
    const albedo = (deck: string) => assets.get(`deck-${deck}.png`)!;
    // Mean relative luminance, its spread, and the mean red minus blue (warmth), over every pixel.
    const stats = (buf: Buffer) => {
      const { w, rows } = decode(buf);
      let sum = 0, sq = 0, warm = 0, n = 0;
      for (const row of rows) {
        for (let x = 0; x < w; x++) {
          const l = relativeLuminance([row[x * 3]!, row[x * 3 + 1]!, row[x * 3 + 2]!]);
          sum += l;
          sq += l * l;
          warm += row[x * 3]! - row[x * 3 + 2]!;
          n++;
        }
      }
      return { mean: sum / n, spread: Math.sqrt(sq / n - (sum / n) ** 2), warm: warm / n };
    };

    it('makes one 256 px albedo per deck, within 300 KB a deck with the shared roughness (art.md section 2)', () => {
      for (const deck of DECK_NAMES) {
        const { w, h } = decode(albedo(deck));
        expect([w, h], deck).toEqual([256, 256]);
        expect(albedo(deck).length + assets.get('deck-roughness.png')!.length, deck).toBeLessThanOrEqual(300 * 1024);
      }
    });

    it('gives every deck its own look', () => {
      expect(new Set(DECK_NAMES.map((deck) => sha(albedo(deck)))).size).toBe(DECK_NAMES.length);
    });

    it('keeps every deck a mid-tone like the steel of #344, so both marbles can read 3:1 on it', () => {
      for (const deck of DECK_NAMES) {
        const { mean } = stats(albedo(deck));
        expect(mean, deck).toBeGreaterThan(0.2);
        expect(mean, deck).toBeLessThan(0.4);
      }
    });

    it('the laminate of the Mess and the wood of the Chapel are warm, the Bridge panel is the smoothest', () => {
      expect(stats(albedo('mess')).warm).toBeGreaterThan(0);
      expect(stats(albedo('chapel')).warm).toBeGreaterThan(0);
      const spreads = DECK_NAMES.map((deck) => stats(albedo(deck)).spread);
      expect(stats(albedo('bridge')).spread).toBe(Math.min(...spreads));
    });
  });

  // Task #440: each deck has its own generated normal map for the cells.
  describe('a normal map per deck (#440)', () => {
    const normal = (deck: string) => assets.get(`deck-${deck}-normal.png`)!;
    const normalStats = (buf: Buffer) => {
      const { w, rows } = decode(buf);
      let sumR = 0, sumG = 0, sumB = 0, n = 0;
      for (const row of rows) {
        for (let x = 0; x < w; x++) {
          sumR += row[x * 3]!;
          sumG += row[x * 3 + 1]!;
          sumB += row[x * 3 + 2]!;
          n++;
        }
      }
      return { r: sumR / n, g: sumG / n, b: sumB / n };
    };

    it('makes one 256 px normal map per deck, within 300 KB a deck with albedo and roughness (art.md section 2)', () => {
      for (const deck of DECK_NAMES) {
        const buf = normal(deck);
        expect(buf, `missing normal map for ${deck}`).toBeDefined();
        const { w, h } = decode(buf);
        expect([w, h], deck).toEqual([256, 256]);
        const deckTotal =
          buf.length +
          assets.get(`deck-${deck}.png`)!.length +
          assets.get('deck-roughness.png')!.length;
        expect(deckTotal, deck).toBeLessThanOrEqual(300 * 1024);
      }
    });

    it('gives every deck its own normal map', () => {
      expect(new Set(DECK_NAMES.map((deck) => sha(normal(deck)))).size).toBe(DECK_NAMES.length);
    });

    it('encodes tangent-space normals: Z points outward, X and Y tilt around 128', () => {
      for (const deck of DECK_NAMES) {
        const s = normalStats(normal(deck));
        expect(s.b, `${deck} normal Z`).toBeGreaterThan(180);
        expect(s.r, `${deck} normal X`).toBeGreaterThan(115);
        expect(s.r, `${deck} normal X`).toBeLessThan(140);
        expect(s.g, `${deck} normal Y`).toBeGreaterThan(115);
        expect(s.g, `${deck} normal Y`).toBeLessThan(140);
      }
    });
  });

  it('keeps the total asset size under the budget', () => {
    const total = [...assets.values()].reduce((n, b) => n + b.length, 0);
    expect(total).toBeLessThan(BUDGET_BYTES);
  });

  it('writes every asset file to textures/ when run as a script', async () => {
    const written = new Map<string, Buffer>();
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      mkdirSync: vi.fn(),
      writeFileSync: (url: URL, buf: Buffer) => written.set(fileURLToPath(url), buf),
    }));
    const log: unknown[][] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...line) => void log.push(line));
    const argv = process.argv[1];
    process.argv[1] = fileURLToPath(new URL('./gen-assets.mjs', import.meta.url)); // as `node scripts/gen-assets.mjs`
    vi.resetModules();
    try {
      await import('./gen-assets.mjs');
    } finally {
      process.argv[1] = argv;
      vi.doUnmock('node:fs');
      spy.mockRestore();
    }
    const dir = fileURLToPath(new URL('../textures/', import.meta.url));
    expect(hashes(written)).toEqual(new Map([...hashes(assets)].map(([n, h]) => [dir + n, h])));
    expect(log).toHaveLength(written.size); // one line per file
  });
});

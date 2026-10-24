import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { ASSET_NAMES, SEED, generateAssets } from './gen-assets.mjs';

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const hashAll = (assets: Map<string, Buffer>): string =>
  sha(Buffer.concat([...assets.entries()].map(([n, b]) => Buffer.concat([Buffer.from(n), b]))));

// docs/specs/tech.md section 9: the initial load stays under 5 MB gzipped. Textures get a fifth of it.
const BUDGET_BYTES = 1_000_000;

// Width, height and RGB rows of a PNG written by png() (one IDAT chunk, filter 0 on every row).
function decode(buf: Buffer): { w: number; h: number; rows: Buffer[] } {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const at = buf.indexOf('IDAT');
  const raw = inflateSync(buf.subarray(at + 4, at + 4 + buf.readUInt32BE(at - 4)));
  const stride = w * 3 + 1;
  return { w, h, rows: Array.from({ length: h }, (_, y) => raw.subarray(y * stride + 1, (y + 1) * stride)) };
}

describe('gen-assets', () => {
  it('is deterministic: two runs with the same seed give the same hash', () => {
    expect(hashAll(generateAssets(SEED))).toBe(hashAll(generateAssets(SEED)));
  });

  it('changes when the seed changes', () => {
    expect(hashAll(generateAssets(SEED + 1))).not.toBe(hashAll(generateAssets(SEED)));
  });

  it('produces valid PNG files for every expected asset', () => {
    const assets = generateAssets(SEED);
    expect([...assets.keys()].sort()).toEqual([...ASSET_NAMES].sort());
    for (const buf of assets.values()) {
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  it('keeps the committed files identical to the generator output', () => {
    for (const [name, buf] of generateAssets(SEED)) {
      expect(readFileSync(new URL(`../public/assets/${name}`, import.meta.url))).toEqual(buf);
    }
  });

  // docs/specs/art.md section 2: the shell's ridge normal map, 256 px at most, 64 KB at most (#293).
  it('makes a ridge normal map for the shell within 256 px and 64 KB', () => {
    const buf = generateAssets(SEED).get('shell-normal.png')!;
    const { w, h } = decode(buf);
    expect(Math.max(w, h)).toBeLessThanOrEqual(256);
    expect(buf.length).toBeLessThanOrEqual(64 * 1024);
  });

  it('ridges the shell across its width: the x tilt turns from one side to the other many times on every row', () => {
    const { w, rows } = decode(generateAssets(SEED).get('shell-normal.png')!);
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

  it('keeps the total asset size under the budget', () => {
    const total = [...generateAssets(SEED).values()].reduce((n, b) => n + b.length, 0);
    expect(total).toBeLessThan(BUDGET_BYTES);
  });
});

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { ASSET_NAMES, SEED, generateAssets } from './gen-assets.mjs';

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const hashAll = (assets: Map<string, Buffer>): string =>
  sha(Buffer.concat([...assets.entries()].map(([n, b]) => Buffer.concat([Buffer.from(n), b]))));

// docs/specs/tech.md section 9: the initial load stays under 5 MB gzipped. Textures get a fifth of it.
const BUDGET_BYTES = 1_000_000;

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

  it('keeps the total asset size under the budget', () => {
    const total = [...generateAssets(SEED).values()].reduce((n, b) => n + b.length, 0);
    expect(total).toBeLessThan(BUDGET_BYTES);
  });
});

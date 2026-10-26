import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PBR_DIR = join(__dirname, '../public/assets/pbr');

const EXPECTED_PBR_MAPS = [
  // Bulkhead
  { name: 'bulkhead-albedo.jpg', minKb: 40, maxKb: 250 },
  { name: 'bulkhead-normal.png', minKb: 200, maxKb: 1200 },
  { name: 'bulkhead-roughness.png', minKb: 100, maxKb: 900 },
  { name: 'bulkhead-displacement.png', minKb: 10, maxKb: 200 },

  // Deck floor
  { name: 'deck-pbr-albedo.jpg', minKb: 80, maxKb: 350 },
  { name: 'deck-pbr-normal.png', minKb: 500, maxKb: 2500 },
  { name: 'deck-pbr-roughness.png', minKb: 300, maxKb: 1500 },
  { name: 'deck-pbr-displacement.png', minKb: 100, maxKb: 800 },

  // Grate / machinery
  { name: 'grate-albedo.jpg', minKb: 80, maxKb: 350 },
  { name: 'grate-normal.png', minKb: 500, maxKb: 2500 },
  { name: 'grate-roughness.png', minKb: 200, maxKb: 1200 },
  { name: 'grate-displacement.png', minKb: 50, maxKb: 500 },
];

describe('PBR textures for spaceship bay', () => {
  it('has all 12 generated PBR maps in public/assets/pbr', () => {
    for (const { name, minKb, maxKb } of EXPECTED_PBR_MAPS) {
      const filePath = join(PBR_DIR, name);
      expect(existsSync(filePath)).toBe(true);
      const sizeKb = statSync(filePath).size / 1024;
      expect(sizeKb).toBeGreaterThanOrEqual(minKb);
      expect(sizeKb).toBeLessThanOrEqual(maxKb);
    }
  });
});

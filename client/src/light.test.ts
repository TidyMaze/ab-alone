import { describe, expect, it } from 'vitest';
import { LIGHT } from './light';

// Low-key lighting (docs/specs/world.md section 5): one hard warm lamp, a low fill, never a flat white.
describe('scene light (world.md section 5)', () => {
  it('one hard key dominates a low ambient fill, no flat white', () => {
    expect(LIGHT.ambient.intensity).toBeLessThanOrEqual(0.3);
    expect(LIGHT.key.intensity / LIGHT.ambient.intensity).toBeGreaterThanOrEqual(4);
  });

  it('the key is the Mess lamp: sodium warm, from overhead and to one side', () => {
    expect(LIGHT.key.color).toBe(0xd9822b);
    expect(LIGHT.key.position[1]).toBeGreaterThan(0);
  });

  it('exposure keeps the white marble below clipping', () => {
    expect(LIGHT.exposure).toBeGreaterThan(0);
    expect(LIGHT.exposure).toBeLessThanOrEqual(1);
  });
});

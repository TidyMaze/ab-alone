import { describe, expect, it } from 'vitest';
import { relativeLuminance } from './contrast';
import { DECOR, LIGHT } from './light';

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

  it('the key shadow settings cover the whole board with soft contact shadows (#459)', () => {
    expect(LIGHT.key.shadow.mapSize).toBeGreaterThanOrEqual(1024);
    expect(LIGHT.key.shadow.camera.bounds).toBeGreaterThanOrEqual(6); // board radius ~4.3
    expect(LIGHT.key.shadow.camera.near).toBeGreaterThan(0);
    expect(LIGHT.key.shadow.camera.far).toBeGreaterThan(20);
    expect(LIGHT.key.shadow.bias).toBeLessThan(0); // avoids shadow acne
    expect(LIGHT.key.shadow.normalBias).toBeGreaterThan(0);
  });

  it('exposure keeps the white marble below clipping', () => {
    expect(LIGHT.exposure).toBeGreaterThan(0);
    expect(LIGHT.exposure).toBeLessThanOrEqual(1);
  });
});

// Reflections and accents (#376): the key stays the base, the accents are small and only add highlights.
describe('reflections and accent lights (#376)', () => {
  it('the room reflections are a low share, so the key lamp stays the base', () => {
    expect(LIGHT.environment.intensity).toBeGreaterThan(0);
    expect(LIGHT.environment.intensity).toBeLessThanOrEqual(0.3);
  });

  it('the dark glass takes less reflection than the shell, so it keeps 3:1 on the deck', () => {
    expect(LIGHT.environment.glass).toBeGreaterThan(0);
    expect(LIGHT.environment.glass).toBeLessThan(LIGHT.environment.intensity);
  });

  it('the cold rim is the player cyan, the warm point is the sodium orange', () => {
    expect(LIGHT.accents.rim.color).toBe(0x7fd6e8);
    expect(LIGHT.accents.warm.color).toBe(0xd9822b);
  });

  it('each accent is weaker than the key, so the key is still the one hard source', () => {
    expect(LIGHT.accents.rim.intensity).toBeLessThan(LIGHT.key.intensity);
    expect(LIGHT.accents.warm.intensity).toBeLessThan(LIGHT.key.intensity);
  });
});

describe('background decor (#376)', () => {
  const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

  it('the decor is darker than the steel of the board, never brighter than it', () => {
    expect(relativeLuminance(hex(DECOR.color))).toBeLessThan(relativeLuminance(hex(0x4a5258)));
  });
});

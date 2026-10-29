import { describe, expect, it } from 'vitest';
import { relativeLuminance } from './contrast';
import { DECK_NAMES } from './deck';
import { DECKS, DECOR, LIGHT } from './light';

// Low-key lighting (docs/specs/world.md section 5): one hard source per deck, a low fill, never a flat white.
describe('deck light presets (world.md section 5, #400)', () => {
  const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

  it('one preset per deck', () => {
    expect(Object.keys(DECKS)).toEqual([...DECK_NAMES]);
  });

  for (const deck of DECK_NAMES) {
    const light = DECKS[deck];
    it(`${deck}: one hard key dominates a low ambient fill, no flat white`, () => {
      expect(light.ambient.intensity).toBeLessThanOrEqual(0.3);
      expect(light.key.intensity / light.ambient.intensity).toBeGreaterThanOrEqual(4);
    });

    it(`${deck}: the key comes from overhead`, () => {
      expect(light.key.position[1]).toBeGreaterThan(0);
    });

    it(`${deck}: exposure keeps the white marble below clipping`, () => {
      expect(light.exposure).toBeGreaterThan(0);
      expect(light.exposure).toBeLessThanOrEqual(1);
    });

    it(`${deck}: some fog`, () => {
      expect(light.fog).toBeGreaterThan(0);
    });
  }

  it('the Mess keeps the sodium lamp and the haze of #290', () => {
    expect(DECKS.mess.key.color).toBe(0xd9822b);
    expect(DECKS.mess.fog).toBe(1);
  });

  it('the key shadow, the same on every deck, covers the whole board with soft contact shadows (#459)', () => {
    expect(LIGHT.key.shadow.mapSize).toBeGreaterThanOrEqual(1024);
    expect(LIGHT.key.shadow.camera.bounds).toBeGreaterThanOrEqual(6); // board radius ~4.3
    expect(LIGHT.key.shadow.camera.near).toBeGreaterThan(0);
    expect(LIGHT.key.shadow.camera.far).toBeGreaterThan(20);
    expect(LIGHT.key.shadow.bias).toBeLessThan(0); // avoids shadow acne
    expect(LIGHT.key.shadow.normalBias).toBeGreaterThan(0);
  });

  it('each deck has its own key colour', () => {
    expect(new Set(DECK_NAMES.map((deck) => DECKS[deck].key.color)).size).toBe(DECK_NAMES.length);
  });

  it('Mess, Furnace and Chapel are lit warm, Cargo and the Bridge cold', () => {
    for (const deck of ['mess', 'furnace', 'chapel'] as const) {
      const [r, , b] = rgb(DECKS[deck].key.color);
      expect(r, deck).toBeGreaterThan(b);
    }
    for (const deck of ['cargo', 'bridge'] as const) {
      const [r, , b] = rgb(DECKS[deck].key.color);
      expect(b, deck).toBeGreaterThan(r);
    }
  });

  it('the Furnace steam is the thickest fog, the Bridge has almost none', () => {
    const fogs = DECK_NAMES.map((deck) => DECKS[deck].fog);
    expect(DECKS.furnace.fog).toBe(Math.max(...fogs));
    expect(DECKS.bridge.fog).toBe(Math.min(...fogs));
    expect(DECKS.bridge.fog).toBeLessThan(DECKS.mess.fog / 2);
  });
});

// Reflections and accents (#376): the key stays the base, the accents are small and only add highlights.
describe('reflections and accent lights (#376)', () => {
  it('the room reflections are a low share, so the key lamp stays the base', () => {
    expect(LIGHT.environment.intensity).toBeGreaterThan(0);
    expect(LIGHT.environment.intensity).toBeLessThanOrEqual(0.3);
  });

  it('the cold rim is the player cyan, the warm point is the sodium orange', () => {
    expect(LIGHT.accents.rim.color).toBe(0x7fd6e8);
    expect(LIGHT.accents.warm.color).toBe(0xd9822b);
  });

  it('each accent is weaker than every deck key, so the key is still the one hard source', () => {
    for (const deck of DECK_NAMES) {
      expect(LIGHT.accents.rim.intensity).toBeLessThan(DECKS[deck].key.intensity);
      expect(LIGHT.accents.warm.intensity).toBeLessThan(DECKS[deck].key.intensity);
    }
  });
});

describe('background decor (#376)', () => {
  const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

  it('the decor is darker than the steel of the board, never brighter than it', () => {
    expect(relativeLuminance(hex(DECOR.color))).toBeLessThan(relativeLuminance(hex(0x4a5258)));
  });
});

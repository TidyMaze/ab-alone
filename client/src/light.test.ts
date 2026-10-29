import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { DECKS, LIGHT } from './light';

// The deck presets (docs/specs/world.md section 5): exposure and fog. The room's own lights light the scene (#877).
describe('deck light presets (world.md section 5, #400)', () => {
  const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

  it('one preset per deck', () => {
    expect(Object.keys(DECKS)).toEqual([...DECK_NAMES]);
  });

  for (const deck of DECK_NAMES) {
    const light = DECKS[deck];
    it(`${deck}: exposure keeps the white marble below clipping`, () => {
      expect(light.exposure).toBeGreaterThan(0);
      expect(light.exposure).toBeLessThanOrEqual(1);
    });

    it(`${deck}: some fog`, () => {
      expect(light.fog).toBeGreaterThan(0);
    });
  }

  it('the Mess keeps the haze of #290', () => {
    expect(DECKS.mess.fog).toBe(1);
  });

  it('the Furnace steam is the thickest fog, the Bridge has almost none', () => {
    const fogs = DECK_NAMES.map((deck) => DECKS[deck].fog);
    expect(DECKS.furnace.fog).toBe(Math.max(...fogs));
    expect(DECKS.bridge.fog).toBe(Math.min(...fogs));
    expect(DECKS.bridge.fog).toBeLessThan(DECKS.mess.fog / 2);
  });
});

// Reflections (#376): the room's lights stay the base.
describe('reflections (#376)', () => {
  it('the room reflections are a low share, so the room\'s lights stay the base', () => {
    expect(LIGHT.environment.intensity).toBeGreaterThan(0);
    expect(LIGHT.environment.intensity).toBeLessThanOrEqual(0.3);
  });
});

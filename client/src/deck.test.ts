import { describe, expect, it } from 'vitest';
import { DECK_NAMES, DECK_PARTICLES, deckOf } from './deck';

// Each mode and boss plays on its deck (docs/specs/world.md sections 1 and 3, art.md Decks).
describe('deckOf (world.md sections 1, 3 and 5)', () => {
  it('the five decks, bottom to top', () => {
    expect(DECK_NAMES).toEqual(['mess', 'cargo', 'furnace', 'chapel', 'bridge']);
  });

  it('hot-seat and the bot play at the Mess tables', () => {
    expect(deckOf('local')).toBe('mess');
    expect(deckOf('bot')).toBe('mess');
  });

  it('online games play on the Cargo PvP tables', () => {
    expect(deckOf('online')).toBe('cargo');
  });

  it('the battle royale plays in the Furnace arenas', () => {
    expect(deckOf('royale')).toBe('furnace');
  });

  it('each boss, and so each daily, plays on its own deck', () => {
    expect(deckOf('boss', 'echo')).toBe('mess');
    expect(deckOf('boss', 'hull')).toBe('cargo');
    expect(deckOf('boss', 'choir')).toBe('furnace');
    expect(deckOf('boss', 'chaplain')).toBe('chapel');
    expect(deckOf('boss', 'ballast')).toBe('bridge');
  });

  it('a boss the client does not know yet plays at the Mess', () => {
    expect(deckOf('boss', 'nobody')).toBe('mess');
    expect(deckOf('boss')).toBe('mess');
  });

  // Task #443: airborne particles per deck (docs/specs/world.md section 5).
  describe('DECK_PARTICLES', () => {
    it('defines particle preset for every deck', () => {
      for (const deck of DECK_NAMES) {
        expect(DECK_PARTICLES[deck]).toBeDefined();
      }
    });

    it('matches world.md section 5: Mess dust, Cargo ore dust, Furnace steam, Chapel candle smoke, Bridge none', () => {
      expect(DECK_PARTICLES.mess.kind).toBe('dust');
      expect(DECK_PARTICLES.cargo.kind).toBe('ore');
      expect(DECK_PARTICLES.furnace.kind).toBe('steam');
      expect(DECK_PARTICLES.chapel.kind).toBe('smoke');
      expect(DECK_PARTICLES.bridge.kind).toBe('none');

      expect(DECK_PARTICLES.mess.count).toBeGreaterThan(0);
      expect(DECK_PARTICLES.cargo.count).toBeGreaterThan(0);
      expect(DECK_PARTICLES.furnace.count).toBeGreaterThan(0);
      expect(DECK_PARTICLES.chapel.count).toBeGreaterThan(0);
      expect(DECK_PARTICLES.bridge.count).toBe(0);

      // Steam and smoke rise (drift Y > 0), ore dust settles (drift Y < 0)
      expect(DECK_PARTICLES.furnace.drift[1]).toBeGreaterThan(0);
      expect(DECK_PARTICLES.chapel.drift[1]).toBeGreaterThan(0);
      expect(DECK_PARTICLES.cargo.drift[1]).toBeLessThan(0);
    });
  });
});

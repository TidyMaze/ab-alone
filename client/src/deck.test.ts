import { describe, expect, it } from 'vitest';
import { DECK_NAMES, deckOf } from './deck';

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
});

import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { LORE } from './lore';

// The lore terminal entries (docs/specs/world.md sections 2 to 4): 2 per deck, 120 words at most each.
describe('LORE (world.md section 4)', () => {
  it('every deck has two entries', () => {
    for (const deck of DECK_NAMES) expect(LORE.filter((e) => e.deck === deck)).toHaveLength(2);
    expect(LORE).toHaveLength(10);
  });

  it('every entry has a unique id, a title and a body', () => {
    expect(new Set(LORE.map((e) => e.id)).size).toBe(LORE.length);
    for (const e of LORE) {
      expect(e.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
      expect(e.title.trim()).not.toBe('');
      expect(e.body.trim()).not.toBe('');
    }
  });

  it('a body holds 120 words at most', () => {
    for (const e of LORE) expect(e.body.split(/\s+/).filter(Boolean).length, e.id).toBeLessThanOrEqual(120);
  });
});

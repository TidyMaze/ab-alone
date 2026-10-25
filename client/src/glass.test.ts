import { describe, expect, it } from 'vitest';
import { glassSide, sideName } from './glass';

// The pale glass side is named White, the dark shell side Black, whatever side number it has.
describe('sideName', () => {
  it('names the side wearing the pale glass White, and the shell Black, against the bot', () => {
    expect(sideName(1, 1)).toBe('White');
    expect(sideName(2, 1)).toBe('Black');
  });
  it('keeps hot-seat and online names: glass on side 2, so side 2 is White', () => {
    expect(sideName(1, 2)).toBe('Black');
    expect(sideName(2, 2)).toBe('White');
  });
});

// world.md section 5: the player is the smoked glass, the enemy and the bosses the shell.
describe('glassSide, world.md section 5', () => {
  it('the human is the glass against the bot: Black (side 1)', () => {
    expect(glassSide({ online: false, bot: true, fight: false })).toBe(1);
  });
  it('the human is the glass in a boss fight: Black (side 1)', () => {
    expect(glassSide({ online: false, bot: true, fight: true })).toBe(1);
  });
  it('hot-seat keeps White (side 2) as the glass', () => {
    expect(glassSide({ online: false, bot: false, fight: false })).toBe(2);
  });
  it('online keeps White (side 2) as the glass until the spec picks a side', () => {
    expect(glassSide({ online: true, bot: false, fight: false })).toBe(2);
  });
});

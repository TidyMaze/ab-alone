import { describe, expect, it } from 'vitest';
import { glassSide } from './glass';

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

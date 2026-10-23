import { describe, expect, it } from 'vitest';
import { Seats } from './seats';

describe('Seats', () => {
  it('binds a free seat to one key and remembers who holds it', () => {
    const s = new Seats(2);
    expect(s.claim(1, 'a')).toBe(true);
    expect(s.keyOf(1)).toBe('a');
    expect(s.seatOf('a')).toBe(1);
    expect(s.keyOf(2)).toBe('');
    expect(s.seatOf('b')).toBe(0);
    expect(s.roster()).toEqual(['a', '']);
    expect(s.full).toBe(false);
  });

  it('refuses a taken seat, a key that already sits elsewhere and a seat out of range', () => {
    const s = new Seats(2);
    s.claim(1, 'a');
    expect(s.claim(1, 'b')).toBe(false);
    expect(s.claim(2, 'a')).toBe(false);
    expect(s.claim(3, 'c')).toBe(false);
    expect(s.claim(0, 'c')).toBe(false);
    expect(s.claim(1.5, 'c')).toBe(false);
    expect(s.claim(2, '')).toBe(false);
    expect(s.claim(1, 'a')).toBe(true); // the same key asking again keeps its seat
  });

  it('is full when every seat is bound, for any seat count', () => {
    const s = new Seats(3);
    s.claim(1, 'a');
    s.claim(2, 'b');
    expect(s.full).toBe(false);
    s.claim(3, 'c');
    expect(s.full).toBe(true);
  });

  it('adopts a roster of the right shape and ignores any other', () => {
    const s = new Seats(2);
    expect(s.adopt(['a', 'b'])).toBe(true);
    expect(s.roster()).toEqual(['a', 'b']);
    expect(s.adopt(['a'])).toBe(false);
    expect(s.adopt(['a', 'a'])).toBe(false); // one key, one seat
    expect(s.adopt(['a', 1 as unknown as string])).toBe(false);
    expect(s.roster()).toEqual(['a', 'b']);
  });
});

import { describe, expect, it } from 'vitest';
import { colourOf, nextGameId, rematchText, seatFor } from './rematch';

describe('nextGameId', () => {
  it('derives the same new id from the finished one on every peer, never the old id', async () => {
    const next = await nextGameId('room');
    expect(next).toMatch(/^[0-9a-f]{64}$/);
    expect(await nextGameId('room')).toBe(next);
    expect(next).not.toBe('room');
    expect(await nextGameId('other room')).not.toBe(next);
  });

  it('gives each rematch of a room its own id', async () => {
    const first = await nextGameId('room');
    const second = await nextGameId(first);
    expect(second).not.toBe(first);
    expect(second).not.toBe('room');
  });
});

describe('colourOf / seatFor', () => {
  it('keeps the seat colours in the first game and swaps them in each rematch, rules.md section 10.2', () => {
    expect([colourOf(1, 0, 2), colourOf(2, 0, 2)]).toEqual([1, 2]);
    expect([colourOf(1, 1, 2), colourOf(2, 1, 2)]).toEqual([2, 1]);
    expect([colourOf(1, 2, 2), colourOf(2, 2, 2)]).toEqual([1, 2]);
  });

  it('rotates the colours with more seats', () => {
    expect([1, 2, 3].map((seat) => colourOf(seat, 1, 3))).toEqual([2, 3, 1]);
  });

  it('finds the seat that plays a colour, the inverse of colourOf', () => {
    for (const count of [2, 3]) {
      for (let n = 0; n < 4; n++) {
        for (let seat = 1; seat <= count; seat++) expect(seatFor(colourOf(seat, n, count), n, count)).toBe(seat);
      }
    }
  });
});

describe('rematchText', () => {
  it('says nothing until someone asked', () => {
    expect(rematchText(1, false, false)).toBe('');
  });

  it('says when we asked and when the opponent asked', () => {
    expect(rematchText(1, true, false)).toBe('You asked for a rematch. Waiting for White...');
    expect(rematchText(2, false, true)).toBe('Black asks for a rematch.');
  });
});

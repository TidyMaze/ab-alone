import { describe, expect, it } from 'vitest';
import { ANGRY_HOLD_MS, ANGRY_LINES, BUBBLE_FADE_MS, CHAR_MS, GLITCH_MS, TAUNT_HOLD_MS, TYPE_CPS, angryLine, speechAt } from './speech';

// The Overseer's speech bubbles (#741): typed at 17 characters a second, a short flicker per character, held, then faded.

const taunt = { text: 'Hello you', hold: TAUNT_HOLD_MS, angry: false };

describe('speechAt, the typing timer of a bubble', () => {
  it('types at 17 characters a second, the first character at once', () => {
    expect(TYPE_CPS).toBe(17);
    expect(CHAR_MS).toBeCloseTo(1000 / 17);
    expect(speechAt(taunt, 0, false).text).toBe('H');
    expect(speechAt(taunt, CHAR_MS * 2.5, false).text).toBe('Hel');
    expect(speechAt(taunt, CHAR_MS * 100, false).text).toBe('Hello you');
    expect(speechAt(taunt, -50, false).text).toBe('H'); // a clock before the start
  });

  it('flickers for a moment at each new character while typing, never once typed', () => {
    expect(speechAt(taunt, 1, false).glitch).toBe(true);
    expect(speechAt(taunt, CHAR_MS * 3 + GLITCH_MS - 1, false).glitch).toBe(true);
    expect(speechAt(taunt, CHAR_MS * 3 + GLITCH_MS + 1, false).glitch).toBe(false);
    expect(speechAt(taunt, CHAR_MS * 9, false).glitch).toBe(false);
  });

  it('holds 3 s after the last character, then fades and is done', () => {
    const typed = taunt.text.length * CHAR_MS;
    expect(speechAt(taunt, typed + TAUNT_HOLD_MS - 1, false)).toMatchObject({ opacity: 1, done: false });
    expect(speechAt(taunt, typed + TAUNT_HOLD_MS + BUBBLE_FADE_MS / 2, false)).toMatchObject({ opacity: 0.5, done: false });
    expect(speechAt(taunt, typed + TAUNT_HOLD_MS + BUBBLE_FADE_MS, false)).toMatchObject({ opacity: 0, done: true });
  });

  it('an angry bubble holds 1 s', () => {
    const angry = { text: 'Stop', hold: ANGRY_HOLD_MS, angry: true };
    const typed = 4 * CHAR_MS;
    expect(speechAt(angry, typed + ANGRY_HOLD_MS - 1, false).opacity).toBe(1);
    expect(speechAt(angry, typed + ANGRY_HOLD_MS + BUBBLE_FADE_MS, false).done).toBe(true);
  });

  it('with reduced motion shows the whole text at once, with no flicker, and keeps the hold', () => {
    expect(speechAt(taunt, 0, true)).toMatchObject({ text: 'Hello you', glitch: false, opacity: 1, done: false });
    expect(speechAt(taunt, TAUNT_HOLD_MS + BUBBLE_FADE_MS, true).done).toBe(true);
  });
});

describe('angryLine, the line of a core burnt on a vent', () => {
  it('are the 6 lines of the owner, verbatim', () => {
    expect(ANGRY_LINES).toEqual([
      'That core was load-bearing. Like your hopes.',
      "Do you know what that cost? No. You can't count.",
      'Stop touching my things.',
      'I will remember that. I remember everything.',
      'Congratulations. You broke something. Again.',
      'That was mine. Everything here is mine.',
    ]);
  });

  it('is the same for the same seed and ply, on every peer', () => {
    expect(angryLine(153, 7)).toBe(angryLine(153, 7));
  });

  it('is always one of the 6, and over many plies every line comes up', () => {
    const picked = new Set(Array.from({ length: 200 }, (_, ply) => angryLine(153, ply)));
    expect([...picked].sort()).toEqual([...ANGRY_LINES].sort());
  });

  it('changes with the fight seed', () => {
    const [a, b] = [1, 2].map((seed) => Array.from({ length: 20 }, (_, ply) => angryLine(seed, ply)).join('|'));
    expect(a).not.toBe(b);
  });
});

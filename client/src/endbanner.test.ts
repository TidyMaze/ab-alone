import { describe, expect, it } from 'vitest';
import { endBanner, type EndMode } from './endbanner';

const input = (mode: EndMode, side: number, status: number, reason = 0, win = 6) => ({ mode, side, status, reason, win });
const REPEAT = 1;
const STALL = 2;

describe('endBanner', () => {
  it('shows nothing while the game runs', () => {
    expect(endBanner(input('local', 0, 0))).toBeNull();
  });

  it('all combinations of mode, side, status and reason: title and animation', () => {
    const rows: [EndMode, number, number, number, string, string][] = [
      // mode, side, status, reason, title, animation
      ['local', 0, 1, 0, 'Black wins', 'win'],
      ['local', 0, 2, 0, 'White wins', 'win'],
      ['local', 0, 3, REPEAT, 'Draw', 'draw'],
      ['local', 0, 3, STALL, 'Draw', 'draw'],
      ['bot', 1, 1, 0, 'You win', 'win'],
      ['bot', 1, 2, 0, 'You lose', 'loss'],
      ['bot', 1, 3, REPEAT, 'Draw', 'draw'],
      ['bot', 1, 3, STALL, 'Draw', 'draw'],
      ['boss', 1, 1, 0, 'Victory', 'win'],
      ['boss', 1, 2, 0, 'Defeat', 'loss'],
      ['boss', 1, 3, REPEAT, 'Defeat', 'loss'], // a draw against a boss is a defeat (rules.md 10.3)
      ['boss', 1, 3, STALL, 'Defeat', 'loss'],
      ['online', 1, 1, 0, 'You win', 'win'],
      ['online', 1, 2, 0, 'You lose', 'loss'],
      ['online', 2, 2, 0, 'You win', 'win'],
      ['online', 2, 1, 0, 'You lose', 'loss'],
      ['online', 1, 3, REPEAT, 'Draw', 'draw'],
      ['online', 2, 3, STALL, 'Draw', 'draw'],
      ['online', 0, 1, 0, 'Black wins', 'win'], // a spectator sees the colours
      ['online', 0, 2, 0, 'White wins', 'win'],
      ['online', 0, 3, REPEAT, 'Draw', 'draw'],
    ];
    for (const [mode, side, status, reason, title, anim] of rows) {
      const b = endBanner(input(mode, side, status, reason))!;
      expect([mode, side, status, reason, b.title, b.anim]).toEqual([mode, side, status, reason, title, anim]);
    }
  });

  it('gives the reason in the ship tone, with the ejections the winner needed', () => {
    expect(endBanner(input('bot', 1, 1, 0, 6))!.line).toBe('6 out. The books balance.');
    expect(endBanner(input('bot', 1, 2, 0, 6))!.line).toBe('6 out. Tally strikes your name.');
    expect(endBanner(input('boss', 1, 1, 0, 10))!.line).toBe('10 out. The seat is empty.');
    expect(endBanner(input('boss', 1, 2, 0, 6))!.line).toBe('6 out. The seat holds.');
    expect(endBanner(input('local', 0, 2, 0, 6))!.line).toBe('6 out. The books balance.');
    expect(endBanner(input('bot', 1, 3, REPEAT))!.line).toBe('Same position three times. Tally closes the page.');
    expect(endBanner(input('bot', 1, 3, STALL))!.line).toBe('100 plies, nothing ejected. Tally calls it even.');
    expect(endBanner(input('boss', 1, 3, REPEAT))!.line).toBe('Same position three times. A draw is a defeat here.');
    expect(endBanner(input('boss', 1, 3, STALL))!.line).toBe('100 plies, nothing ejected. A draw is a defeat here.');
  });

  it('names the one action offered: Retry, New game, or Rematch for an online player', () => {
    expect(endBanner(input('boss', 1, 2))!.next).toBe('Retry to fight again.');
    expect(endBanner(input('local', 0, 1))!.next).toBe('New game to play again.');
    expect(endBanner(input('bot', 1, 1))!.next).toBe('New game to play again.');
    expect(endBanner(input('online', 1, 1))!.next).toBe('Rematch to play again.');
    expect(endBanner(input('online', 0, 1))!.next).toBe('');
  });
});

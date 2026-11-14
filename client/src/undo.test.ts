import { describe, expect, it } from 'vitest';
import { UNDO_LABEL, undoAllowed, undoLength, type UndoGame } from './undo';
import { firstWinGame } from './unlock';

const casual: UndoGame = { bot: true, fight: false, run: false, trainer: false, online: false, wild: false, replaying: false, first: false, auto: false, thinking: false, over: false, hub: false, plies: 2 };

describe('undoAllowed', () => {
  it('is on in a normal bot game after a move and a reply', () => expect(undoAllowed(casual)).toBe(true));
  it.each(['fight', 'run', 'trainer', 'online', 'wild', 'replaying', 'first', 'auto', 'thinking', 'over', 'hub'] as const)('is off when %s', (key) =>
    expect(undoAllowed({ ...casual, [key]: true })).toBe(false));
  it('is off without a bot, and with nothing to take back', () => {
    expect(undoAllowed({ ...casual, bot: false })).toBe(false);
    expect(undoAllowed({ ...casual, plies: 0 })).toBe(false);
  });
  it('has a label', () => expect(UNDO_LABEL).toBe('Undo'));
});

describe('undoLength', () => {
  const player = (sides: number[]) => (ply: number) => sides[ply]!;
  it("goes back to the player's turn before the last move: its move and the reply", () => expect(undoLength(4, player([1, 2, 1, 2, 1]), 1)).toBe(2));
  it('goes back to the start after one pair', () => expect(undoLength(2, player([1, 2, 1]), 1)).toBe(0));
  it('takes one ply when the bot passed', () => expect(undoLength(3, player([1, 2, 1, 1]), 1)).toBe(2));
});

describe('an undone game does not unlock', () => {
  const game = { bot: true, fight: false, run: false, trainer: false, online: false, wild: false, replaying: false };
  it('counts without an undo, not with one', () => {
    expect(firstWinGame('win', game)).toBe(true);
    expect(firstWinGame('win', { ...game, undone: true })).toBe(false);
  });
});

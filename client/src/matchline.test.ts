import { describe, expect, it } from 'vitest';
import { matchLine } from './matchline';

// #1568: the HUD subtitle at the start of a match says who plays and the goal, not flavour.
describe('matchLine', () => {
  it('the hot-seat table says two players share one board, with the ejections to win', () => {
    expect(matchLine({ mode: 'local', win: 6 })).toBe('Two players, one board. Eject 6 to win.');
  });

  it('the bot table says you play the bot, its level left to the rating (#1611)', () => {
    expect(matchLine({ mode: 'bot', win: 6 })).toBe('You vs Bot. Eject 6 to win.');
  });

  it('a rogue-lite fight says so, its strength is the act strength, not the setting', () => {
    expect(matchLine({ mode: 'run', win: 6 })).toBe('Rogue-lite fight vs Bot. Eject 6 to win.');
  });

  it('the Trainer says so', () => {
    expect(matchLine({ mode: 'trainer', win: 4 })).toBe('Trainer vs Bot. Eject 4 to win.');
  });

  it('an online table says you play your opponent online', () => {
    expect(matchLine({ mode: 'online', win: 6 })).toBe('You vs your opponent, online. Eject 6 to win.');
  });

  it('the goal follows the ejections to win, whatever the count', () => {
    expect(matchLine({ mode: 'bot', win: 3 })).toBe('You vs Bot. Eject 3 to win.');
  });
});

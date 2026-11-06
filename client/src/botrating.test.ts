import { describe, expect, test } from 'vitest';
import { BOT_NODES } from './bot';
import {
  ANCHOR_RATING,
  BOT_LEVELS,
  BOT_NOTE,
  PROGRESS_PERCENT,
  RATING_PER_DOUBLING,
  RUN_START_PERCENT,
  botLine,
  levelOfRating,
  progressBudget,
  ratingOfBudget,
  runPercent,
} from './botrating';

describe('the bot rating (#1611)', () => {
  test('the plain bot at BOT_NODES is 1500, the anchor of the scale, by decision', () => {
    expect(ANCHOR_RATING).toBe(1500);
    expect(ratingOfBudget(BOT_NODES)).toBe(1500);
  });

  test('a doubling of the budget is worth the measured 65 points, and a rating is shown to the nearest ten', () => {
    expect(RATING_PER_DOUBLING).toBe(65);
    expect(ratingOfBudget(BOT_NODES * 2)).toBe(1560); // 1565
    expect(ratingOfBudget(BOT_NODES / 2)).toBe(1440);
    expect(ratingOfBudget(200)).toBe(1070);
    expect(ratingOfBudget(60000)).toBe(1600);
    expect(ratingOfBudget(0)).toBe(ratingOfBudget(1)); // no budget reads as the smallest
    for (const nodes of [1, 150, 777, 4321, 19000, 60000]) expect(ratingOfBudget(nodes) % 10).toBe(0);
  });

  test('the levels are the issue table: under 1300, 1300 to 1599, 1600 to 1799, 1800 to 1999, 2000 and up', () => {
    expect(BOT_LEVELS.map((l) => l.name)).toEqual(['Easy', 'Normal', 'Hard', 'Very hard', 'Master']);
    const at = (r: number) => levelOfRating(r);
    expect([at(0), at(1299), at(1300), at(1500), at(1599), at(1600), at(1799), at(1800), at(1999), at(2000), at(2600)]).toEqual([
      'Easy', 'Easy', 'Normal', 'Normal', 'Normal', 'Hard', 'Hard', 'Very hard', 'Very hard', 'Master', 'Master',
    ]);
  });

  test('the line reads the estimated rating and the level, with no secret word of the world', () => {
    expect(botLine(BOT_NODES)).toBe('Bot ~1500 · Normal');
    expect(botLine(1)).toMatch(/^Bot ~\d+ · Easy$/);
    expect(BOT_NOTE).toMatch(/estimate/i);
    expect(BOT_NOTE).toMatch(/Ranked/);
    expect(BOT_NOTE).not.toMatch(/\bElo\b/);
  });

  test('the bot grows with the bosses beaten: sixteen steps, never down, from the bottom of Easy to the peak', () => {
    expect(PROGRESS_PERCENT).toHaveLength(16);
    for (let i = 1; i < PROGRESS_PERCENT.length; i++) expect(PROGRESS_PERCENT[i]).toBeGreaterThan(PROGRESS_PERCENT[i - 1]!);
    const rate = (medals: number) => levelOfRating(ratingOfBudget(progressBudget(BOT_NODES, 'normal', medals)));
    expect(rate(0)).toBe('Easy');
    expect(rate(15)).toBe('Hard'); // Master (2000) would need over four million positions a move: the peak is the 300 % of the act 4 boss
    expect(ratingOfBudget(progressBudget(BOT_NODES, 'normal', 0))).toBeLessThan(1200);
  });

  test('the difficulty setting multiplies the progress budget, and the medals count is held to 0..15', () => {
    const at = (d: 'easy' | 'normal' | 'hard', m: number) => progressBudget(BOT_NODES, d, m);
    expect(at('easy', 7) * 2).toBeCloseTo(at('normal', 7), -1);
    expect(at('hard', 7)).toBeCloseTo(at('normal', 7) * 2, -1);
    expect(at('normal', -3)).toBe(at('normal', 0));
    expect(at('normal', 99)).toBe(at('normal', 15));
    expect(progressBudget(1, 'easy', 0)).toBe(1); // never under one position
  });

  test('a run goes from a low budget to the peak on its last fights', () => {
    expect(runPercent(0)).toBe(RUN_START_PERCENT);
    expect(runPercent(1)).toBe(100);
    expect(runPercent(-1)).toBe(RUN_START_PERCENT);
    expect(runPercent(2)).toBe(100);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(runPercent(t)).toBeGreaterThanOrEqual(last);
      last = runPercent(t);
    }
  });
});

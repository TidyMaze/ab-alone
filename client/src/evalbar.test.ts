import { describe, expect, it } from 'vitest';
import { Analyst, BAR_RANGE, evalFill, evalText, WIN_SCORE, type Position } from './evalbar';

describe('evalFill', () => {
  it('is half for an even position, whoever is to move', () => {
    expect(evalFill(0, 1)).toBe(0.5);
    expect(evalFill(0, 2)).toBe(0.5);
  });

  it('turns the side to move score into a fill from Black (0) to White (1)', () => {
    // +150 for Black to move: Black is ahead, below half. The same score for White to move: above.
    expect(evalFill(150, 1)).toBeCloseTo(0.5 - 150 / (2 * BAR_RANGE));
    expect(evalFill(150, 2)).toBeCloseTo(0.5 + 150 / (2 * BAR_RANGE));
    expect(evalFill(-150, 2)).toBeCloseTo(evalFill(150, 1));
  });

  it('is clamped short of the ends for a big lead', () => {
    expect(evalFill(10 * BAR_RANGE, 2)).toBe(0.95);
    expect(evalFill(10 * BAR_RANGE, 1)).toBe(0.05);
  });

  it('puts won and lost games at the very ends', () => {
    expect(evalFill(WIN_SCORE, 1)).toBe(0); // Black to move has won
    expect(evalFill(-WIN_SCORE, 1)).toBe(1); // Black to move has lost
    expect(evalFill(WIN_SCORE - 3, 2)).toBe(1); // White wins in 3 plies
    expect(evalFill(-(WIN_SCORE - 2), 2)).toBe(0); // White loses in 2 plies
  });
});

describe('evalText', () => {
  it('says Even below a twentieth of a marble', () => {
    expect(evalText(0, 1)).toBe('Even');
    expect(evalText(-4, 2)).toBe('Even');
  });

  it('names the side ahead and its lead in marbles', () => {
    expect(evalText(150, 1)).toBe('Black +1.5');
    expect(evalText(150, 2)).toBe('White +1.5');
    expect(evalText(-38, 1)).toBe('White +0.4');
  });

  it('names the winner of a decided game, and says wins once the game is over', () => {
    expect(evalText(WIN_SCORE - 3, 2)).toBe('White winning');
    expect(evalText(-(WIN_SCORE - 2), 2)).toBe('Black winning');
    expect(evalText(-WIN_SCORE, 2)).toBe('Black wins');
    expect(evalText(WIN_SCORE, 1)).toBe('Black wins');
  });
});

describe('Analyst', () => {
  /** An ask whose answers the test gives by hand, in any order. */
  function setup() {
    const calls: { history: number[][]; answer: (score: number) => void }[] = [];
    const shown: [number, Position][] = [];
    const analyst = new Analyst(
      (history) => new Promise<number>((answer) => calls.push({ history, answer })),
      (score, position) => shown.push([score, position]),
    );
    return { calls, shown, analyst };
  }
  const flush = () => new Promise((done) => setTimeout(done, 0));
  const ply = (n: number): Position => ({ history: Array.from({ length: n }, () => [1, 0, n, 0, 0, 0, 0, 0]), side: 1 + (n % 2) });

  it('asks for the position and shows its score', async () => {
    const { calls, shown, analyst } = setup();
    analyst.request(ply(1));
    expect(calls.map((c) => c.history)).toEqual([ply(1).history]);
    calls[0]!.answer(42);
    await flush();
    expect(shown).toEqual([[42, ply(1)]]);
  });

  it('keeps one request in flight, skips the positions played over meanwhile, never shows a stale score', async () => {
    const { calls, shown, analyst } = setup();
    analyst.request(ply(0));
    analyst.request(ply(1));
    analyst.request(ply(2));
    expect(calls).toHaveLength(1); // the worker is busy with ply 0
    calls[0]!.answer(10);
    await flush();
    expect(shown).toEqual([]); // the answer for ply 0 is stale: ply 2 is on the board
    expect(calls.map((c) => c.history.length)).toEqual([0, 2]); // ply 1 is never asked
    calls[1]!.answer(20);
    await flush();
    expect(shown).toEqual([[20, ply(2)]]);
    expect(calls).toHaveLength(2);
  });

  it('drops the answer in flight once stopped, and asks again on the next request', async () => {
    const { calls, shown, analyst } = setup();
    analyst.request(ply(0));
    analyst.stop();
    calls[0]!.answer(5);
    await flush();
    expect(shown).toEqual([]);
    expect(calls).toHaveLength(1);
    analyst.request(ply(3));
    calls[1]!.answer(7);
    await flush();
    expect(shown).toEqual([[7, ply(3)]]);
  });
});

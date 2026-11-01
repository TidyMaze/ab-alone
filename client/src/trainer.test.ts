import { describe, expect, it } from 'vitest';
import { readBest, recordBest, resultText, trainerBudget, waveLine, waveResult } from './trainer';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('Trainer mode, #1159', () => {
  it('keeps the most waves survived, 0 for a store that is empty, full of rubbish or missing', () => {
    const store = memory();
    expect(readBest(store)).toBe(0);
    recordBest(store, 4);
    recordBest(store, 2);
    expect(readBest(store)).toBe(4);
    recordBest(store, 7);
    expect(readBest(store)).toBe(7);
    store.setItem('ab-alone.trainer-best', 'x');
    expect(readBest(store)).toBe(0);
    store.setItem('ab-alone.trainer-best', '-3');
    expect(readBest(store)).toBe(0);
    expect(readBest(null)).toBe(0);
  });

  it('searches as much as a normal game up to a full army, then 10 % more per wave, at most 3 times as much', () => {
    expect(trainerBudget(1, 1000)).toBe(1000);
    expect(trainerBudget(14, 1000)).toBe(1000);
    expect(trainerBudget(15, 1000)).toBe(1100);
    expect(trainerBudget(24, 1000)).toBe(2000);
    expect(trainerBudget(99, 1000)).toBe(3000);
  });

  it('says the wave, the best and the marbles left in the HUD', () => {
    expect(waveLine(5, 3, 2)).toBe('Trainer · wave 5 · best 3 · Marbles left 4/6');
    expect(waveLine(5, 3, 9)).toBe('Trainer · wave 5 · best 3 · Marbles left 0/6');
  });

  it('a real clear costs nothing, a draw costs one marble, and the marbles the bot pushed off cost one each', () => {
    expect(waveResult(5, 0, 0, false)).toEqual({ kind: 'won', survived: 5, lost: 0 });
    expect(waveResult(5, 0, 0, true)).toEqual({ kind: 'drawn', survived: 5, lost: 1 });
    expect(waveResult(5, 2, 1, false)).toEqual({ kind: 'won', survived: 5, lost: 3 });
    expect(waveResult(5, 2, 1, true)).toEqual({ kind: 'drawn', survived: 5, lost: 4 });
  });

  it('the run is over once the pool is empty, whether the last marble was pushed off or drawn away: the wave before is the score', () => {
    expect(waveResult(6, 5, 0, true)).toEqual({ kind: 'lost', survived: 5, lost: 6 });
    expect(waveResult(5, 2, 4, false)).toEqual({ kind: 'lost', survived: 4, lost: 6 });
    expect(waveResult(1, 0, 6, false)).toEqual({ kind: 'lost', survived: 0, lost: 6 });
  });

  it('writes the result card', () => {
    expect(resultText({ kind: 'lost', survived: 4, lost: 6 }, 5, 7)).toEqual(['Fell on wave 5', 'Waves survived: 4', 'Marbles left: 0/6', 'Best: 7']);
    expect(resultText({ kind: 'won', survived: 5, lost: 0 }, 5, 5)).toEqual(['Wave 5 cleared', 'Waves survived: 5', 'Marbles left: 6/6', 'Best: 5']);
    expect(resultText({ kind: 'drawn', survived: 5, lost: 1 }, 5, 5)[0]).toBe('Wave 5 stalled: a draw costs a marble');
  });
});

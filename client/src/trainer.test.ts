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

  it('says the wave and the best in the HUD', () => {
    expect(waveLine(5, 3)).toBe('Trainer · wave 5 · best 3');
  });

  it('turns the end of a wave into its result: won, or the wave before as the score when lost', () => {
    expect(waveResult(5, 1)).toEqual({ kind: 'won', survived: 5 });
    expect(waveResult(5, 2)).toEqual({ kind: 'lost', survived: 4 });
  });

  it('writes the result card', () => {
    expect(resultText({ kind: 'lost', survived: 4 }, 5, 7)).toEqual(['Fell on wave 5', 'Waves survived: 4', 'Best: 7']);
    expect(resultText({ kind: 'won', survived: 5 }, 5, 5)).toEqual(['Wave 5 cleared', 'Waves survived: 5', 'Best: 5']);
  });
});

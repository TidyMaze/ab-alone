import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  DIFFICULTY_PERCENT,
  nextDifficulty,
  readDifficulty,
  scaleBudget,
  writeDifficulty,
  type Difficulty,
} from './difficulty';

describe('difficulty (#704)', () => {
  it('defines three tiers with their percentages', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
    expect(DIFFICULTY_PERCENT.easy).toBe(50);
    expect(DIFFICULTY_PERCENT.normal).toBe(100);
    expect(DIFFICULTY_PERCENT.hard).toBe(200);
  });

  it('provides readable labels with percentages', () => {
    expect(DIFFICULTY_LABELS.easy).toBe('50%');
    expect(DIFFICULTY_LABELS.normal).toBe('100%');
    expect(DIFFICULTY_LABELS.hard).toBe('200%');
  });

  it('cycles through easy, normal and hard', () => {
    expect(nextDifficulty('easy')).toBe('normal');
    expect(nextDifficulty('normal')).toBe('hard');
    expect(nextDifficulty('hard')).toBe('easy');
  });

  it('reads difficulty from storage, defaulting to normal', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(readDifficulty(storage)).toBe('normal');

    writeDifficulty(storage, 'easy');
    expect(readDifficulty(storage)).toBe('easy');

    writeDifficulty(storage, 'hard');
    expect(readDifficulty(storage)).toBe('hard');

    store.set('ab-alone.difficulty', 'invalid');
    expect(readDifficulty(storage)).toBe('normal');
  });

  it('handles null storage and storage exceptions gracefully', () => {
    expect(readDifficulty(null)).toBe('normal');
    expect(() => writeDifficulty(null, 'easy')).not.toThrow();

    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readDifficulty(throwing)).toBe('normal');
    expect(() => writeDifficulty(throwing, 'hard')).not.toThrow();
  });

  it('scales a baseline node budget by difficulty percentage', () => {
    expect(scaleBudget(20000, 'easy')).toBe(10000);
    expect(scaleBudget(20000, 'normal')).toBe(20000);
    expect(scaleBudget(20000, 'hard')).toBe(40000);

    expect(scaleBudget(3000, 'easy')).toBe(1500);
    expect(scaleBudget(3000, 'normal')).toBe(3000);
    expect(scaleBudget(3000, 'hard')).toBe(6000);

    expect(scaleBudget(1, 'easy')).toBe(1); // at least 1
  });
});

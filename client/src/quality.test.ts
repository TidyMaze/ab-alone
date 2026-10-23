import { describe, expect, it } from 'vitest';
import { fogSettings, readClearBoard, readTier, tierFromHints, writeClearBoard, writeTier } from './quality';

const big = { width: 1920, cores: 8, memory: 8, reducedMotion: false };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}
const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('tierFromHints', () => {
  it('is high on a big, capable screen', () => {
    expect(tierFromHints(big)).toBe('high');
  });
  it('is low on a small screen', () => {
    expect(tierFromHints({ ...big, width: 600 })).toBe('low');
  });
  it('is low when the user prefers reduced motion', () => {
    expect(tierFromHints({ ...big, reducedMotion: true })).toBe('low');
  });
  it('is low on few cores or little memory', () => {
    expect(tierFromHints({ ...big, cores: 2 })).toBe('low');
    expect(tierFromHints({ ...big, memory: 2 })).toBe('low');
  });
  it('ignores hints the browser does not give', () => {
    expect(tierFromHints({ width: 1920, reducedMotion: false })).toBe('high');
  });
});

describe('fogSettings', () => {
  it('is lighter on low than on high, and starts further away', () => {
    const low = fogSettings('low', false)!;
    const high = fogSettings('high', false)!;
    expect(low.far).toBeGreaterThan(high.far);
    expect(low.near).toBeGreaterThanOrEqual(high.near);
  });
  it('keeps the fog behind the playable cells', () => {
    expect(fogSettings('high', false)!.near).toBeGreaterThanOrEqual(16);
  });
  it('is off in clear-board mode, in every tier', () => {
    expect(fogSettings('low', true)).toBeNull();
    expect(fogSettings('high', true)).toBeNull();
  });
});

describe('clear-board storage', () => {
  it('defaults to off', () => {
    expect(readClearBoard(memoryStorage())).toBe(false);
  });
  it('writes then reads back', () => {
    const s = memoryStorage();
    writeClearBoard(s, true);
    expect(readClearBoard(s)).toBe(true);
    writeClearBoard(s, false);
    expect(readClearBoard(s)).toBe(false);
  });
  it('falls back to off when storage throws or is missing', () => {
    expect(readClearBoard(throwing)).toBe(false);
    expect(readClearBoard(null)).toBe(false);
  });
  it('does not throw when writing to a broken or missing storage', () => {
    expect(() => writeClearBoard(throwing, true)).not.toThrow();
    expect(() => writeClearBoard(null, true)).not.toThrow();
  });
});

describe('tier storage', () => {
  it('uses the device default when nothing is stored, and stores it', () => {
    const s = memoryStorage();
    expect(readTier(s, { ...big, width: 600 })).toBe('low');
    expect(s.data.get('ab-alone.quality')).toBe('low');
  });
  it('prefers a stored valid tier over the device default', () => {
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'low' }), big)).toBe('low');
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'high' }), { ...big, width: 600 })).toBe('high');
  });
  it('ignores a garbage stored value', () => {
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'ultra' }), big)).toBe('high');
  });
  it('falls back to the device default when storage throws', () => {
    expect(readTier(throwing, big)).toBe('high');
    expect(readTier(null, { ...big, width: 600 })).toBe('low');
  });
  it('writeTier stores and survives a broken storage', () => {
    const s = memoryStorage();
    writeTier(s, 'high');
    expect(s.data.get('ab-alone.quality')).toBe('high');
    expect(() => writeTier(throwing, 'low')).not.toThrow();
    expect(() => writeTier(null, 'low')).not.toThrow();
  });
});

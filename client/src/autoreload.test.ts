import { describe, expect, it } from 'vitest';
import { atStake, claimReload, type Stake } from './autoreload';

const idle: Stake = {
  online: false,
  ranked: false,
  fight: false,
  royale: false,
  run: false,
  trainer: false,
  replaying: false,
  openWorld: false,
  sheetOpen: false,
  typing: false,
};

describe('atStake', () => {
  it('is false at the menu, the hub or a local game (saved, #218)', () => {
    expect(atStake(idle)).toBe(false);
  });
  it.each(Object.keys(idle) as (keyof Stake)[])('is true while %s', (key) => {
    expect(atStake({ ...idle, [key]: true })).toBe(true);
  });
});

const memory = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('claimReload', () => {
  it('grants one reload per build', () => {
    const store = memory();
    expect(claimReload(() => store, 'abc')).toBe(true);
    expect(claimReload(() => store, 'abc')).toBe(false);
    expect(claimReload(() => store, 'def')).toBe(true);
  });
  it('refuses when the storage fails or is missing', () => {
    expect(claimReload(() => { throw new Error('no storage'); }, 'abc')).toBe(false);
    const broken = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: () => {},
    };
    expect(claimReload(() => broken, 'abc')).toBe(false);
    expect(claimReload(() => null, 'abc')).toBe(false);
  });
});

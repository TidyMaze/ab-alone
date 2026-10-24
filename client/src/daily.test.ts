import { describe, expect, it } from 'vitest';
import {
  SITE,
  countAttempt,
  dailyCard,
  dailyFor,
  dailyLine,
  dailyTitle,
  hash32,
  readAttempts,
  utcDay,
} from './daily';

// The boss list of the bridge (boss_ids()) at the time of writing. The client never hard-codes it,
// the tests only need one to pin the picks.
const IDS = ['echo', 'hull', 'choir', 'chaplain'];
const MIDNIGHT = Date.UTC(2026, 9, 25); // 2026-10-25 00:00 UTC
const DAY_MS = 24 * 3600 * 1000;

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

describe('utcDay', () => {
  it('is the UTC date as YYYY-MM-DD', () => {
    expect(utcDay(Date.UTC(2026, 0, 5, 12))).toBe('2026-01-05');
  });
  it('changes at 00:00 UTC, not before', () => {
    expect(utcDay(MIDNIGHT - 1)).toBe('2026-10-24');
    expect(utcDay(MIDNIGHT)).toBe('2026-10-25');
  });
  it('does not depend on the local time zone of the instant', () => {
    expect(utcDay(Date.parse('2026-10-24T22:30:00-05:00'))).toBe('2026-10-25'); // 03:30 UTC
    expect(utcDay(Date.parse('2026-10-25T01:30:00+02:00'))).toBe('2026-10-24'); // 23:30 UTC
  });
});

describe('hash32', () => {
  // Pinned values, computed by an independent implementation (32-bit FNV-1a, then the murmur3
  // finaliser). A change here changes every player's daily challenge.
  it('gives the pinned values', () => {
    expect(hash32('ab-alone daily 2026-10-24')).toBe(2374354862);
    expect(hash32('ab-alone daily 2026-10-25')).toBe(3522622740);
    expect(hash32('ab-alone daily 2000-02-29')).toBe(2132627021);
  });
  it('is an unsigned 32-bit integer', () => {
    for (let k = 0; k < 365; k++) {
      const h = hash32(`ab-alone daily ${utcDay(MIDNIGHT + k * DAY_MS)}`);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('dailyFor', () => {
  it('gives the pinned boss and seed of a day', () => {
    expect(dailyFor('2026-10-24', IDS)).toEqual({ day: '2026-10-24', id: 'choir', seed: 2374354862 });
    expect(dailyFor('2026-10-25', IDS)).toEqual({ day: '2026-10-25', id: 'echo', seed: 3522622740 });
  });
  it('is the same for every call on the same day', () => {
    expect(dailyFor(utcDay(MIDNIGHT), IDS)).toEqual(dailyFor(utcDay(MIDNIGHT + DAY_MS - 1), IDS));
  });
  it('gives a new seed at 00:00 UTC', () => {
    expect(dailyFor(utcDay(MIDNIGHT), IDS).seed).not.toBe(dailyFor(utcDay(MIDNIGHT - 1), IDS).seed);
  });
  it('gives a different seed every day of a year, and picks every boss', () => {
    const year = Array.from({ length: 365 }, (_, k) => dailyFor(utcDay(MIDNIGHT + k * DAY_MS), IDS));
    expect(new Set(year.map((d) => d.seed)).size).toBe(365);
    expect(new Set(year.map((d) => d.id))).toEqual(new Set(IDS));
  });
  it('picks only among the listed bosses', () => {
    expect(dailyFor('2026-10-24', ['echo']).id).toBe('echo');
    expect(dailyFor('2026-10-24', ['hull', 'echo']).id).toBe('hull'); // 2374354862 is even
  });
});

describe('daily text', () => {
  it('titles the button with the date and the boss name', () => {
    expect(dailyTitle('2026-10-24', 'The Choir')).toBe('Daily challenge 2026-10-24: The Choir');
  });
  it('gives the HUD line with the attempt of the day', () => {
    expect(dailyLine('2026-10-24', 3)).toBe('Daily challenge 2026-10-24 · attempt 3');
  });
});

describe('attempts of the day', () => {
  it('starts at 0', () => {
    expect(readAttempts(memoryStorage(), '2026-10-24')).toBe(0);
  });
  it('counts one more attempt at each start', () => {
    const s = memoryStorage();
    expect(countAttempt(s, '2026-10-24')).toBe(1);
    expect(countAttempt(s, '2026-10-24')).toBe(2);
    expect(countAttempt(s, '2026-10-24')).toBe(3);
    expect(readAttempts(s, '2026-10-24')).toBe(3);
    expect(s.data.get('ab-alone.daily')).toBe('2026-10-24 3');
  });
  it('resets on a new UTC day', () => {
    const s = memoryStorage({ 'ab-alone.daily': '2026-10-24 5' });
    expect(readAttempts(s, '2026-10-25')).toBe(0);
    expect(countAttempt(s, '2026-10-25')).toBe(1);
    expect(readAttempts(s, '2026-10-24')).toBe(0); // only the current day is kept
  });
  it('ignores a garbage stored value', () => {
    for (const bad of ['', 'nonsense', '2026-10-24', '2026-10-24 x', '2026-10-24 -2']) {
      const s = memoryStorage({ 'ab-alone.daily': bad });
      expect(readAttempts(s, '2026-10-24')).toBe(0);
      expect(countAttempt(s, '2026-10-24')).toBe(1);
    }
  });
  it('counts 1 and never throws when storage throws or is missing', () => {
    expect(readAttempts(throwing, '2026-10-24')).toBe(0);
    expect(readAttempts(null, '2026-10-24')).toBe(0);
    expect(countAttempt(throwing, '2026-10-24')).toBe(1);
    expect(countAttempt(null, '2026-10-24')).toBe(1);
  });
});

describe('result card', () => {
  const fight = { day: '2026-10-25', boss: 'The Echo', plies: 41, attempt: 3 };
  it('links to the site', () => {
    expect(SITE).toBe('https://tidymaze.github.io/ab-alone/');
  });
  it('gives the date, the boss, the win, the plies and the attempt, then the link', () => {
    expect(dailyCard({ ...fight, result: 1 })).toBe(
      'AB-ALONE daily 2026-10-25: The Echo\nVictory in 41 plies on attempt 3\nhttps://tidymaze.github.io/ab-alone/',
    );
  });
  it('gives a loss as a defeat (a draw is a loss)', () => {
    expect(dailyCard({ ...fight, result: 2, plies: 8, attempt: 1 })).toBe(
      'AB-ALONE daily 2026-10-25: The Echo\nDefeat in 8 plies on attempt 1\nhttps://tidymaze.github.io/ab-alone/',
    );
  });
  it('says one ply, not one plies', () => {
    expect(dailyCard({ ...fight, result: 2, plies: 1 }).split('\n')[1]).toBe('Defeat in 1 ply on attempt 3');
  });
  it('is empty while the fight is on: no card before the end', () => {
    expect(dailyCard({ ...fight, result: 0 })).toBe('');
  });
});

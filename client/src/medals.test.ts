import { describe, expect, it } from 'vitest';
import { bestTurns, countAttempt, countWin, hasMedal, loadMedals, loadTallies, medalLabel, medalLine, medalRoom, playerTurns, recordMedal, tallyLine } from './medals';

const KEY = 'ab-alone.medals';
const TALLY = 'ab-alone.boss-tally';
const memory = (saved?: string, tally?: string): Storage => {
  const items = new Map<string, string>(saved === undefined ? [] : [[KEY, saved]]);
  if (tally !== undefined) items.set(TALLY, tally);
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
};

describe('boss medals', () => {
  it('starts with no medal, in private mode too', () => {
    expect(loadMedals(memory())).toEqual({});
    expect(loadMedals(null)).toEqual({});
    expect(hasMedal(null, 'echo')).toBe(false);
    expect(bestTurns(null, 'echo')).toBeNull();
  });

  it('counts the turns of the player: Black moves first, the win is a Black ply', () => {
    expect(playerTurns(1)).toBe(1);
    expect(playerTurns(23)).toBe(12);
  });

  it('the first win earns the medal with its turn count', () => {
    const store = memory();
    expect(recordMedal(store, 'echo', 14)).toBe('first');
    expect(JSON.parse(store.getItem(KEY)!)).toEqual({ echo: 14 });
    expect(hasMedal(store, 'echo')).toBe(true);
    expect(bestTurns(store, 'echo')).toBe(14);
    expect(hasMedal(store, 'hull')).toBe(false);
  });

  it('a faster win is a new record, a slower or equal one keeps the best', () => {
    const store = memory();
    recordMedal(store, 'echo', 14);
    expect(recordMedal(store, 'echo', 14)).toBe('kept');
    expect(recordMedal(store, 'echo', 20)).toBe('kept');
    expect(bestTurns(store, 'echo')).toBe(14);
    expect(recordMedal(store, 'echo', 9)).toBe('record');
    expect(bestTurns(store, 'echo')).toBe(9);
    recordMedal(store, 'hull', 30);
    expect(loadMedals(store)).toEqual({ echo: 9, hull: 30 });
  });

  it.each([
    ['not JSON', '{'],
    ['null', 'null'],
    ['an array', '[3]'],
    ['a number', '3'],
  ])('starts over on a corrupt save: %s', (_, saved) => {
    expect(loadMedals(memory(saved))).toEqual({});
  });

  it('drops the entries that are no positive whole turn count', () => {
    const saved = JSON.stringify({ echo: 5, hull: 0, choir: 'x', alien: 2.5, magnetizer: -1 });
    expect(loadMedals(memory(saved))).toEqual({ echo: 5 });
  });

  it('keeps playing when the storage throws', () => {
    const store = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(recordMedal(store, 'echo', 4)).toBe('first');
    expect(hasMedal(store, 'echo')).toBe(false);
  });

  it('words the menu label and the banner line', () => {
    expect(medalLabel(12)).toBe('Medal: 12 turns');
    expect(medalLabel(1)).toBe('Medal: 1 turn');
    expect(medalLine('first', 12)).toBe('Medal earned: 12 turns.');
    expect(medalLine('record', 9)).toBe('New record: 9 turns.');
    expect(medalLine('kept', 14)).toBe('Medal best: 14 turns.');
  });

  it('lists every boss in the given order with its best turns, or Not beaten (the Medal room, #812)', () => {
    const bosses = [
      { id: 'echo', name: 'Echo' },
      { id: 'hull', name: 'Hull' },
      { id: 'choir', name: 'Choir' },
    ];
    const room = medalRoom(memory(JSON.stringify({ choir: 1, echo: 12 })), bosses);
    expect(room.title).toBe('Medal room');
    expect(room.body).toBe('Echo: 12 turns. Hull: Not beaten. Choir: 1 turn.');
    expect(medalRoom(null, bosses).body).toBe('Echo: Not beaten. Hull: Not beaten. Choir: Not beaten.');
  });

  it('lists the wins of the attempts after the best turns, and nothing for a boss never tried (#1538)', () => {
    const bosses = [
      { id: 'echo', name: 'Echo' },
      { id: 'hull', name: 'Hull' },
      { id: 'choir', name: 'Choir' },
    ];
    const tally = JSON.stringify({ echo: { wins: 2, attempts: 5 }, hull: { wins: 0, attempts: 3 } });
    expect(medalRoom(memory(JSON.stringify({ echo: 12 }), tally), bosses).body).toBe(
      'Echo: 12 turns. Won 2 of 5. Hull: Not beaten. Won 0 of 3. Choir: Not beaten.',
    );
  });
});

describe('boss win and attempt counters (#1538)', () => {
  it('starts empty, in private mode and with an unreadable save too', () => {
    expect(loadTallies(memory())).toEqual({});
    expect(loadTallies(null)).toEqual({});
    expect(loadTallies(memory(undefined, 'not json'))).toEqual({});
    expect(loadTallies(memory(undefined, '[1]'))).toEqual({});
    expect(loadTallies(memory(undefined, 'null'))).toEqual({});
  });

  it('keeps only whole counts, and never fewer attempts than wins', () => {
    const saved = JSON.stringify({
      echo: { wins: 2, attempts: 1 },
      hull: { wins: 1.5, attempts: 3 },
      choir: { wins: -1, attempts: 3 },
      ballast: 7,
      swarm: null,
      stalker: { wins: 1, attempts: 4 },
      rail: { wins: 0 },
    });
    expect(loadTallies(memory(undefined, saved))).toEqual({ echo: { wins: 2, attempts: 2 }, stalker: { wins: 1, attempts: 4 } });
  });

  it('counts an attempt, then a win of the same fight', () => {
    const store = memory();
    countAttempt(store, 'echo');
    countAttempt(store, 'echo');
    countWin(store, 'echo');
    countAttempt(store, 'hull');
    expect(JSON.parse(store.getItem(TALLY)!)).toEqual({ echo: { wins: 1, attempts: 2 }, hull: { wins: 0, attempts: 1 } });
  });

  it('a win of a fight started before the counters existed still has an attempt', () => {
    const store = memory();
    countWin(store, 'echo');
    expect(loadTallies(store)).toEqual({ echo: { wins: 1, attempts: 1 } });
  });

  it('words the line of the Medal room', () => {
    expect(tallyLine({ wins: 1, attempts: 3 })).toBe('Won 1 of 3.');
    expect(tallyLine({ wins: 0, attempts: 1 })).toBe('Won 0 of 1.');
  });

  it('does not throw in private mode', () => {
    expect(() => countAttempt(null, 'echo')).not.toThrow();
    expect(() => countWin(null, 'echo')).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { bestTurns, hasMedal, loadMedals, medalLabel, medalLine, medalRoom, playerTurns, recordMedal } from './medals';

const KEY = 'ab-alone.medals';
const memory = (saved?: string): Storage => {
  const items = new Map<string, string>(saved === undefined ? [] : [[KEY, saved]]);
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
});

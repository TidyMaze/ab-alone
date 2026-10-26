import { describe, expect, it } from 'vitest';
import { roomAt, START, step } from './hub';
import { loadProgress, recordWin, saveProgress, type Progress } from './progress';

const KEY = 'ab-alone.progress';
const memory = (saved?: string): Storage => {
  const items = new Map<string, string>(saved === undefined ? [] : [[KEY, saved]]);
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
};
const fresh: Progress = { at: START, beaten: [] };

describe('hub progress', () => {
  it('starts on the centre cell of the Mess with no boss beaten', () => {
    expect(loadProgress(memory())).toEqual(fresh);
    expect(loadProgress(null)).toEqual(fresh);
  });

  it('saves the deck, the cell and the bosses beaten as versioned JSON, and loads them back', () => {
    const store = memory();
    const progress: Progress = { at: { deck: 'cargo', cell: [-1, 2] }, beaten: ['echo'] };
    saveProgress(store, progress);
    expect(JSON.parse(store.getItem(KEY)!)).toEqual({ version: 1, deck: 'cargo', cell: [-1, 2], beaten: ['echo'] });
    expect(loadProgress(store)).toEqual(progress);
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', '3'],
    ['null', 'null'],
    ['another version', JSON.stringify({ version: 2, deck: 'mess', cell: [0, 0], beaten: [] })],
    ['an unknown deck', JSON.stringify({ version: 1, deck: 'attic', cell: [0, 0], beaten: [] })],
    ['a cell off the map', JSON.stringify({ version: 1, deck: 'mess', cell: [3, 0], beaten: [] })],
    ['a cell that is no pair', JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0, 0], beaten: [] })],
    ['a cell that is no array', JSON.stringify({ version: 1, deck: 'mess', cell: '0,0', beaten: [] })],
    ['no boss list', JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0] })],
    ['a boss that is no string', JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0], beaten: [1] })],
  ])('resets to the start on a corrupt save: %s', (_, saved) => {
    expect(loadProgress(memory(saved))).toEqual(fresh);
  });

  it('starts over when the storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => recordWin(blocked, 'echo')).not.toThrow();
    expect(loadProgress(blocked)).toEqual(fresh);
  });

  it('records a boss win once, and keeps the deck and the cell', () => {
    const store = memory();
    saveProgress(store, { at: { deck: 'mess', cell: [2, 0] }, beaten: [] });
    recordWin(store, 'echo');
    recordWin(store, 'echo');
    expect(loadProgress(store)).toEqual({ at: { deck: 'mess', cell: [2, 0] }, beaten: ['echo'] });
    recordWin(store, 'hull');
    expect(loadProgress(store).beaten).toEqual(['echo', 'hull']);
  });

  it("beating deck n's boss opens the lift onto deck n+1", () => {
    const store = memory();
    const up = (deck: 'mess' | 'cargo'): Progress['at'] => step({ deck, cell: [1, -1] }, [1, -2], loadProgress(store).beaten);
    expect(roomAt('mess', [1, -2])).toEqual({ kind: 'lift', to: 'cargo' });
    expect(up('mess')).toEqual({ deck: 'mess', cell: [1, -1] }); // locked: the Echo is not beaten
    recordWin(store, 'echo');
    expect(up('mess')).toEqual({ deck: 'cargo', cell: [-1, 2] });
    expect(up('cargo')).toEqual({ deck: 'cargo', cell: [1, -1] }); // the Furnace waits for the Hull
  });
});

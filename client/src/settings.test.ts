import { describe, expect, it } from 'vitest';
import { menuOpen, settingsList } from './settings';

describe('settingsList', () => {
  it('lists Clear board, labelled, with its current state', () => {
    expect(settingsList(false)).toEqual([{ id: 'clear-board', label: 'Clear board', on: false }]);
    expect(settingsList(true)).toEqual([{ id: 'clear-board', label: 'Clear board', on: true }]);
  });

  it('gives every setting a distinct id', () => {
    const ids = settingsList(false).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('menuOpen', () => {
  it('opens on the cog and closes on the cog again', () => {
    expect(menuOpen(false, 'cog')).toBe(true);
    expect(menuOpen(true, 'cog')).toBe(false);
  });

  it('closes on Escape and on a click outside, and stays closed', () => {
    for (const event of ['escape', 'outside'] as const) {
      expect(menuOpen(true, event)).toBe(false);
      expect(menuOpen(false, event)).toBe(false);
    }
  });
});

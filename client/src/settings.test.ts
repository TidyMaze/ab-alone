import { describe, expect, it } from 'vitest';
import { menuOpen, settingsList } from './settings';

describe('settingsList', () => {
  it('lists Clear board then Sound, labelled, with their current state', () => {
    expect(settingsList(false, true)).toEqual([
      { id: 'clear-board', label: 'Clear board', on: false },
      { id: 'sound', label: 'Sound', on: true },
    ]);
    expect(settingsList(true, false)).toEqual([
      { id: 'clear-board', label: 'Clear board', on: true },
      { id: 'sound', label: 'Sound', on: false },
    ]);
  });

  it('gives every setting a distinct id', () => {
    const ids = settingsList(false, true).map((s) => s.id);
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

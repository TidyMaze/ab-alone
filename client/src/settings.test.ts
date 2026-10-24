import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';
import { menuOpen, settingsList } from './settings';

describe('settingsList', () => {
  it('lists Clear board, Sound, Export game and Import game, labelled, with an icon and the toggles state', () => {
    expect(settingsList(false, true)).toEqual([
      { id: 'clear-board', label: 'Clear board', icon: 'fog', on: false },
      { id: 'sound', label: 'Sound', icon: 'sound', on: true },
      { id: 'export-game', label: 'Export game', icon: 'export' },
      { id: 'import-game', label: 'Import game', icon: 'import' },
    ]);
    expect(settingsList(true, false)).toEqual([
      { id: 'clear-board', label: 'Clear board', icon: 'fog', on: true },
      { id: 'sound', label: 'Sound', icon: 'muted', on: false },
      { id: 'export-game', label: 'Export game', icon: 'export' },
      { id: 'import-game', label: 'Import game', icon: 'import' },
    ]);
  });

  it('gives every menu item a name and an icon of the set', () => {
    for (const s of [...settingsList(false, false), ...settingsList(true, true)]) {
      expect(s.label).not.toBe('');
      expect(Object.keys(ICONS)).toContain(s.icon);
    }
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

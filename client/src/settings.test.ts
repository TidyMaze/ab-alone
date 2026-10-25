import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';
import { menuOpen, nextTheme, settingsList, themeAttribute } from './settings';

describe('settingsList', () => {
  it('lists Clear board, Sound, Safe mode, Theme, UI scale, Export game and Import game, labelled, with an icon and the state', () => {
    expect(settingsList(false, true, 'system', 100, true)).toEqual([
      { id: 'clear-board', label: 'Clear board', icon: 'fog', on: false },
      { id: 'sound', label: 'Sound', icon: 'sound', on: true },
      { id: 'safe-mode', label: 'Safe mode', icon: 'safe', on: true },
      { id: 'theme', label: 'Theme: System', icon: 'theme' },
      { id: 'ui-scale', label: 'UI scale: 100 %', icon: 'scale' },
      { id: 'export-game', label: 'Export game', icon: 'export' },
      { id: 'import-game', label: 'Import game', icon: 'import' },
    ]);
    expect(settingsList(true, false, 'light', 200, false)).toEqual([
      { id: 'clear-board', label: 'Clear board', icon: 'fog', on: true },
      { id: 'sound', label: 'Sound', icon: 'muted', on: false },
      { id: 'safe-mode', label: 'Safe mode', icon: 'safe', on: false },
      { id: 'theme', label: 'Theme: Light', icon: 'theme' },
      { id: 'ui-scale', label: 'UI scale: 200 %', icon: 'scale' },
      { id: 'export-game', label: 'Export game', icon: 'export' },
      { id: 'import-game', label: 'Import game', icon: 'import' },
    ]);
  });

  it('gives every menu item a name and an icon of the set', () => {
    for (const s of [...settingsList(false, false, 'dark', 125, false), ...settingsList(true, true, 'system', 200, true)]) {
      expect(s.label).not.toBe('');
      expect(Object.keys(ICONS)).toContain(s.icon);
    }
  });

  it('gives every setting a distinct id', () => {
    const ids = settingsList(false, true, 'system', 100, true).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('theme', () => {
  it('cycles System, Dark, Light, then System again', () => {
    expect(nextTheme('system')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('system');
  });

  it('sets data-theme for Dark and Light, and leaves it off for System (the system setting decides)', () => {
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('system')).toBeNull();
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

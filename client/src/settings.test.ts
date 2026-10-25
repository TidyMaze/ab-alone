import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';
import { menuOpen, nextDisplay, nextTheme, settingsList, themeAttribute } from './settings';
import { skinById } from './skins';

describe('settingsList', () => {
  it('lists Clear board, Sound, Theme (with the UI scale and Safe mode), the shell skin, Export game and Import game', () => {
    expect(settingsList(false, true, 'system', 'scarab', 100, true)).toEqual([
      { id: 'clear-board', label: 'Clear board', icon: 'fog', on: false },
      { id: 'sound', label: 'Sound', icon: 'sound', on: true },
      { id: 'theme', label: 'Theme: System', icon: 'theme', on: true },
      { id: 'shell-skin', label: skinById('scarab').name, icon: 'skin' },
      { id: 'export-game', label: 'Export game', icon: 'export' },
      { id: 'import-game', label: 'Import game', icon: 'import' },
    ]);
    expect(settingsList(true, false, 'light', 'scarab', 200, false)).toEqual([
      { id: 'clear-board', label: 'Clear board', icon: 'fog', on: true },
      { id: 'sound', label: 'Sound', icon: 'muted', on: false },
      { id: 'theme', label: 'Theme: Light', icon: 'theme', on: false },
      { id: 'shell-skin', label: skinById('scarab').name, icon: 'skin' },
      { id: 'export-game', label: 'Export game', icon: 'export' },
      { id: 'import-game', label: 'Import game', icon: 'import' },
    ]);
  });

  it('keeps the menu at six rows: no separate Display row', () => {
    expect(settingsList(false, true, 'system', 'scarab', 100, true)).toHaveLength(6);
  });

  it('cycles the theme first; once back to System, steps the UI scale up to the cap; then 100 % with Safe mode flipped', () => {
    expect(nextDisplay('system', 100, true, 200)).toEqual({ theme: 'dark', scale: 100, safe: true });
    expect(nextDisplay('dark', 100, true, 200)).toEqual({ theme: 'light', scale: 100, safe: true });
    expect(nextDisplay('light', 100, true, 200)).toEqual({ theme: 'system', scale: 125, safe: true });
    expect(nextDisplay('system', 175, true, 200)).toEqual({ theme: 'dark', scale: 175, safe: true });
    expect(nextDisplay('light', 200, true, 200)).toEqual({ theme: 'system', scale: 100, safe: false });
    expect(nextDisplay('light', 100, false, 100)).toEqual({ theme: 'system', scale: 100, safe: true });
  });

  it('gives every menu item a name and an icon of the set', () => {
    for (const s of [...settingsList(false, false, 'dark', 'scarab', 125, false), ...settingsList(true, true, 'system', 'scarab', 200, true)]) {
      expect(s.label).not.toBe('');
      expect(Object.keys(ICONS)).toContain(s.icon);
    }
  });

  it('gives every setting a distinct id', () => {
    const ids = settingsList(false, true, 'system', 'scarab', 100, true).map((s) => s.id);
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
  it('opens on its button (the cog, the mode button) and closes on it again', () => {
    expect(menuOpen(false, 'button')).toBe(true);
    expect(menuOpen(true, 'button')).toBe(false);
  });

  it('closes on Escape, on a click outside and on a picked mode, and stays closed', () => {
    for (const event of ['escape', 'outside', 'pick'] as const) {
      expect(menuOpen(true, event)).toBe(false);
      expect(menuOpen(false, event)).toBe(false);
    }
  });
});

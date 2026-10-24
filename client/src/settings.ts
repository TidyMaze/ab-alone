// The settings menu (#277, docs/specs/ui.md section 4): a list of items behind a cog button: the toggles Clear board
// and Sound (#284), then the actions Export game and Import game (#287). Pure functions only: main.ts feeds them the
// clicks and builds the DOM.
import type { IconName } from './icons';

export interface Setting {
  id: string;
  label: string;
  icon: IconName;
  on?: boolean; // a toggle's state, absent on an action
}

/** The items the menu lists, in order, with their icon and the toggles' current state. */
export const settingsList = (clear: boolean, sound: boolean): Setting[] => [
  { id: 'clear-board', label: 'Clear board', icon: 'fog', on: clear },
  { id: 'sound', label: 'Sound', icon: sound ? 'sound' : 'muted', on: sound },
  { id: 'export-game', label: 'Export game', icon: 'export' },
  { id: 'import-game', label: 'Import game', icon: 'import' },
];

export type MenuEvent = 'cog' | 'escape' | 'outside';

/** Whether the menu is open after `event`: the cog toggles it, Escape and a click outside close it. */
export const menuOpen = (open: boolean, event: MenuEvent): boolean => (event === 'cog' ? !open : false);

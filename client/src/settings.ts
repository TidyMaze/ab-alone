// The settings menu (#277, docs/specs/ui.md section 4): a list of settings behind a cog button: Clear board,
// then Sound (#284). Pure functions only: main.ts feeds them the clicks and builds the DOM.

export interface Setting {
  id: string;
  label: string;
  on: boolean;
}

/** The settings the menu lists, in order, with their current state. */
export const settingsList = (clear: boolean, sound: boolean): Setting[] => [
  { id: 'clear-board', label: 'Clear board', on: clear },
  { id: 'sound', label: 'Sound', on: sound },
];

export type MenuEvent = 'cog' | 'escape' | 'outside';

/** Whether the menu is open after `event`: the cog toggles it, Escape and a click outside close it. */
export const menuOpen = (open: boolean, event: MenuEvent): boolean => (event === 'cog' ? !open : false);

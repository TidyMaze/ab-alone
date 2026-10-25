// The settings menu (#277, docs/specs/ui.md section 4): a list of items behind a cog button: the toggles Clear board,
// Reduced motion (#379), Flat HUD (#391) and Sound (#284), Safe mode (#380), the Theme choice (#317), the Shell skin choice (#377), the UI
// scale (#382), then the actions Export game and Import game (#287). Pure functions only: main.ts feeds them the clicks
// and builds the DOM.
import type { IconName } from './icons';
import { skinById } from './skins';
import { nextUiScale, type UiScale } from './uiscale';

export interface Setting {
  id: string;
  label: string;
  icon: IconName;
  on?: boolean; // a toggle's state, absent on an action
}

/** The theme choice: System follows the system setting, Dark and Light force it (#317). */
export type Theme = 'system' | 'dark' | 'light';
const THEME_NAMES: Record<Theme, string> = { system: 'System', dark: 'Dark', light: 'Light' };

/** The choice after a press on the Theme item: System, Dark, Light, then System again. */
export const nextTheme = (theme: Theme): Theme => (theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system');

/** The `data-theme` value of a choice, null to leave the attribute off so the system setting decides. */
export const themeAttribute = (theme: Theme): string | null => (theme === 'system' ? null : theme);

/** The choice after a press on the Theme row: the theme cycles first; once it is back to System, the UI scale steps
 *  up to the cap; once the scale is back to 100 %, Safe mode flips. The theme stays the main action of the row. */
export const nextDisplay = (
  theme: Theme,
  scale: UiScale,
  safe: boolean,
  max: UiScale,
): { theme: Theme; scale: UiScale; safe: boolean } => {
  const next = nextTheme(theme);
  if (next !== 'system') return { theme: next, scale, safe };
  return scale < max ? { theme: next, scale: nextUiScale(scale, max), safe } : { theme: next, scale: 100, safe: !safe };
};

/** Whether motion is cut (#379): the player's choice once pressed, else the system's prefers-reduced-motion. */
export const motionReduced = (system: boolean, saved: boolean | null): boolean => saved ?? system;

/** The items the menu lists, in order, with their icon and the toggles' current state. The Theme row shows the UI scale
 *  and holds Safe mode as its pressed state, so the menu keeps eight rows with Reduced motion and Flat HUD. */
export const settingsList = (
  clear: boolean,
  sound: boolean,
  theme: Theme,
  skin: string,
  scale: UiScale,
  safe: boolean,
  reduced: boolean,
  flat: boolean,
): Setting[] => [
  { id: 'clear-board', label: 'Clear board', icon: 'fog', on: clear },
  { id: 'reduced-motion', label: 'Reduced motion', icon: 'motion', on: reduced },
  { id: 'flat-hud', label: 'Flat HUD', icon: 'flat', on: flat },
  { id: 'sound', label: 'Sound', icon: sound ? 'sound' : 'muted', on: sound },
  { id: 'theme', label: `Theme: ${THEME_NAMES[theme]}`, icon: 'theme', on: safe },
  { id: 'shell-skin', label: skinById(skin).name, icon: 'skin' },
  { id: 'export-game', label: 'Export game', icon: 'export' },
  { id: 'import-game', label: 'Import game', icon: 'import' },
];

export type MenuEvent = 'button' | 'escape' | 'outside' | 'pick';

/** Whether a menu is open after `event`: its button (the cog, the mode button of #357) toggles it, Escape, a click
 * outside and a picked game mode close it. */
export const menuOpen = (open: boolean, event: MenuEvent): boolean => (event === 'button' ? !open : false);

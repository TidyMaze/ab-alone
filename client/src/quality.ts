// Quality tiers, fog and the clear-board setting, see docs/specs/tech.md section 5.1, and the sound
// toggle (docs/specs/world.md section 7).
// Pure functions only: main.ts feeds them the browser values.

import { RADIUS } from './board';
import type { Theme } from './settings';
import { skinById } from './skins';

export type Tier = 'low' | 'high';
export interface Hints {
  width: number;
  cores?: number;
  memory?: number;
  reducedMotion: boolean;
}
export type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

const TIER_KEY = 'ab-alone.quality';
const CLEAR_KEY = 'ab-alone.clear-board';
const SOUND_KEY = 'ab-alone.sound';
const THEME_KEY = 'ab-alone.theme';
const SKIN_KEY = 'ab-alone.shell-skin';

export function tierFromHints({ width, cores, memory, reducedMotion }: Hints): Tier {
  const weak = width < 768 || reducedMotion || (cores ?? Infinity) < 4 || (memory ?? Infinity) < 4;
  return weak ? 'low' : 'high';
}

// Linear fog measured from the camera: it starts at the board centre and is thick at the far rim,
// so it follows every zoom level (bug #171: absolute distances started behind the whole board).
// The span is in board radii, a shorter span is a thicker fog.
const FOG_SPAN = { low: RADIUS, high: 0.75 * RADIUS };

export function fogSettings(tier: Tier, clear: boolean, distance: number): { near: number; far: number } | null {
  return clear ? null : { near: distance, far: distance + FOG_SPAN[tier] };
}

/** One stored setting, `null` when missing or when storage is blocked. */
export function read(store: Store, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores one setting, silently dropped when storage is blocked. */
export function write(store: Store, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Storage blocked (private mode, quota): the setting just lasts for this page view.
  }
}

export const readClearBoard = (store: Store): boolean => read(store, CLEAR_KEY) === 'on';
export const writeClearBoard = (store: Store, on: boolean): void => write(store, CLEAR_KEY, on ? 'on' : 'off');
// The one sound on/off toggle until the mix sliders of #60: on unless the player turned it off.
export const readSound = (store: Store): boolean => read(store, SOUND_KEY) !== 'off';
export const writeSound = (store: Store, on: boolean): void => write(store, SOUND_KEY, on ? 'on' : 'off');
// The theme (#317): System unless the player picked Dark or Light. index.html reads the same key before the first paint.
export const readTheme = (store: Store): Theme => {
  const stored = read(store, THEME_KEY);
  return stored === 'dark' || stored === 'light' ? stored : 'system';
};
export const writeTheme = (store: Store, theme: Theme): void => write(store, THEME_KEY, theme);

// The dark shell skin (#377): Scarab ridges unless the player picked another one of skins.ts.
export const readSkin = (store: Store): string => skinById(read(store, SKIN_KEY)).id;
export const writeSkin = (store: Store, id: string): void => write(store, SKIN_KEY, id);

export function readTier(store: Store, hints: Hints): Tier {
  const stored = read(store, TIER_KEY);
  if (stored === 'low' || stored === 'high') return stored;
  const tier = tierFromHints(hints);
  writeTier(store, tier);
  return tier;
}
export const writeTier = (store: Store, tier: Tier): void => write(store, TIER_KEY, tier);

// Under automation (navigator.webdriver) the page draws only while the last draw took under a fifth of the time since it
// began, and at most every 100 ms. CI runners have no GPU: software WebGL takes every core for each draw, and input,
// evaluate and click wait seconds for a frame (bug #216). A player draws every frame.
const AUTOMATED_MIN_GAP_MS = 100;
const AUTOMATED_DUTY = 4;
export const drawDue = (now: number, lastStart: number, lastCost: number, automated: boolean): boolean =>
  !automated || now - lastStart >= Math.max(AUTOMATED_MIN_GAP_MS, AUTOMATED_DUTY * lastCost);

// Under automation the canvas renders at half the device pixel ratio: software WebGL costs by pixels (#349).
// A player always gets the device ratio. The screenshot specs (fog, contrast, eject) pass at this ratio.
const AUTOMATED_PIXEL_RATIO = 0.5;
export const renderPixelRatio = (dpr: number, automated: boolean): number =>
  automated ? Math.min(dpr, AUTOMATED_PIXEL_RATIO) : dpr;

// Under automation the marbles get no room reflections and the scene no accent lights (#376): software WebGL pays for
// them on every pixel of every frame, and the CI specs timed out waiting for frames (bug #416). A player gets both.
export const reflectionsAndAccents = (automated: boolean): boolean => !automated;

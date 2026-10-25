// Quality tiers, fog and the clear-board setting, see docs/specs/tech.md section 5.1, and the sound
// toggle (docs/specs/world.md section 7).
// Pure functions only: main.ts feeds them the browser values.

import type { View } from './camera';
import { FRAME } from './frame';
import type { Theme } from './settings';
import { skinById } from './skins';
import { UI_SCALES, type UiScale } from './uiscale';

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
const FPS_KEY = 'ab-alone.fps';
const SOUND_KEY = 'ab-alone.sound';
const THEME_KEY = 'ab-alone.theme';
const SKIN_KEY = 'ab-alone.shell-skin';
const SAFE_KEY = 'ab-alone.safe-mode';
const SCALE_KEY = 'ab-alone.ui-scale';
const MOTION_KEY = 'ab-alone.reduced-motion';

export function tierFromHints({ width, cores, memory, reducedMotion }: Hints): Tier {
  const weak = width < 768 || reducedMotion || (cores ?? Infinity) < 4 || (memory ?? Infinity) < 4;
  return weak ? 'low' : 'high';
}

// Linear fog on the depth along the view axis (THREE.Fog). It starts at the plate's edge, the farthest point of the
// frame's inner hexagon from the camera, and reaches FOG_AT_RIM at the rim's outer edge: it thickens over the rim and
// beyond, never over a cell, at every zoom and turn of the camera (bugs #171 and #399). `radius` is the frame's.
const FOG_AT_RIM = { low: 0.5, high: 0.8 };

export function fogSettings(tier: Tier, clear: boolean, view: View, radius: number): { near: number; far: number } | null {
  if (clear) return null;
  // How far along the view a hexagon of apothem 1 reaches: its corner nearest the view direction (frame.ts hexagon).
  const reach =
    (Math.sin(view.polar) * Math.max(...[0, 1, 2, 3, 4, 5].map((k) => -Math.sin((k * Math.PI) / 3 + view.azimuth)))) /
    (Math.sqrt(3) / 2);
  const edge = radius * (Math.sqrt(3) / 2) + FRAME.margin;
  const near = view.distance + edge * reach;
  return { near, far: near + (FRAME.rim * reach) / FOG_AT_RIM[tier] };
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
// The FPS readout (#426): off unless the player switched it on in the settings menu.
export const readFps = (store: Store): boolean => read(store, FPS_KEY) === 'on';
export const writeFps = (store: Store, on: boolean): void => write(store, FPS_KEY, on ? 'on' : 'off');
export const writeClearBoard = (store: Store, on: boolean): void => write(store, CLEAR_KEY, on ? 'on' : 'off');
// The one sound on/off toggle until the mix sliders of #60: on unless the player turned it off.
export const readSound = (store: Store): boolean => read(store, SOUND_KEY) !== 'off';
export const writeSound = (store: Store, on: boolean): void => write(store, SOUND_KEY, on ? 'on' : 'off');
// Photosensitivity safe mode (#380): on unless the player turned it off.
export const readSafeMode = (store: Store): boolean => read(store, SAFE_KEY) !== 'off';
export const writeSafeMode = (store: Store, on: boolean): void => write(store, SAFE_KEY, on ? 'on' : 'off');
// The UI scale (#382): 100 % unless the player picked a step.
export const readUiScale = (store: Store): UiScale => {
  const stored = Number(read(store, SCALE_KEY));
  return (UI_SCALES as readonly number[]).includes(stored) ? (stored as UiScale) : 100;
};
export const writeUiScale = (store: Store, scale: UiScale): void => write(store, SCALE_KEY, String(scale));
// The theme (#317): System unless the player picked Dark or Light. index.html reads the same key before the first paint.
export const readTheme = (store: Store): Theme => {
  const stored = read(store, THEME_KEY);
  return stored === 'dark' || stored === 'light' ? stored : 'system';
};
export const writeTheme = (store: Store, theme: Theme): void => write(store, THEME_KEY, theme);
// Reduced motion (#379): null until the player presses the toggle, so the system setting decides (motionReduced).
export const readReducedMotion = (store: Store): boolean | null => {
  const stored = read(store, MOTION_KEY);
  return stored === 'on' ? true : stored === 'off' ? false : null;
};
export const writeReducedMotion = (store: Store, on: boolean): void => write(store, MOTION_KEY, on ? 'on' : 'off');

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

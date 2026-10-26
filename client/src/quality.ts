// Quality tiers, fog and the clear-board setting, see docs/specs/tech.md section 5.1, and the volume
// sliders (docs/specs/world.md section 7).
// Pure functions only: main.ts feeds them the browser values.

import type { View } from './camera';
import { FRAME } from './frame';
import { glassSkinById } from './glassskins';
import { PALETTES, type Palette } from './palettes';
import type { Theme } from './settings';
import type { Bus, Mix } from './sound';
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
const PALETTE_KEY = 'ab-alone.palette';
const SKIN_KEY = 'ab-alone.shell-skin';
const GLASS_KEY = 'ab-alone.glass-skin';
const SAFE_KEY = 'ab-alone.safe-mode';
const SCALE_KEY = 'ab-alone.ui-scale';
const MOTION_KEY = 'ab-alone.reduced-motion';
const FLAT_KEY = 'ab-alone.flat-hud';
const TRANSCRIPT_KEY = 'ab-alone.transcript';

export function tierFromHints({ width, cores, memory, reducedMotion }: Hints): Tier {
  if (reducedMotion || width < 360) return 'low';
  if (width < 768) {
    const capable = (cores ?? 0) >= 6 && memory !== undefined && memory >= 4;
    return capable ? 'high' : 'low';
  }
  const weak = (cores ?? Infinity) < 4 || (memory ?? Infinity) < 4;
  return weak ? 'low' : 'high';
}

// Linear fog on the depth along the view axis (THREE.Fog). It starts at the plate's edge, the farthest point of the
// frame's inner hexagon from the camera, and smoothly extends across the hauler bay (#665).
// It thickens into atmospheric haze, never over a cell, at every zoom and turn of the camera. `radius` is the frame's.
export const BAY_FOG_SPAN = 32;
const FOG_TIER_SCALE = { low: 1.25, high: 1.0 };

// `density` is the deck's (light.ts, #400): it divides the span over the bay, from the same start, so a denser fog is
// thick sooner and still never over a cell.
export function fogSettings(
  tier: Tier,
  clear: boolean,
  view: View,
  radius: number,
  density: number,
): { near: number; far: number } | null {
  if (clear) return null;
  // How far along the view a hexagon of apothem 1 reaches: its corner nearest the view direction (frame.ts hexagon).
  const reach =
    (Math.sin(view.polar) * Math.max(...[0, 1, 2, 3, 4, 5].map((k) => -Math.sin((k * Math.PI) / 3 + view.azimuth)))) /
    (Math.sqrt(3) / 2);
  const edge = radius * (Math.sqrt(3) / 2) + FRAME.margin;
  const near = view.distance + edge * reach;
  return { near, far: near + (BAY_FOG_SPAN * FOG_TIER_SCALE[tier]) / density };
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
// The four volume sliders (#438), 0 to 100 % each, 100 % unless the player moved it. They replace the one Sound
// toggle: a Sound off saved before them sets every slider without a value of its own to 0.
const DEFAULT_MIX: Mix = { music: 100, ambience: 5, effects: 100, voice: 100 };
const volumeKey = (bus: Bus): string => `ab-alone.volume.${bus}`;
export const readMix = (store: Store): Mix => {
  const muted = read(store, SOUND_KEY) === 'off';
  const volume = (bus: Bus): number => {
    const saved = read(store, volumeKey(bus)) ?? '';
    return /^\d+$/.test(saved) && Number(saved) <= 100 ? Number(saved) : muted ? 0 : DEFAULT_MIX[bus];
  };
  return { music: volume('music'), ambience: volume('ambience'), effects: volume('effects'), voice: volume('voice') };
};
export const writeVolume = (store: Store, bus: Bus, percent: number): void => write(store, volumeKey(bus), String(percent));
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
// The flat HUD fallback (#391): off unless the player turned it on.
export const readFlatHud = (store: Store): boolean => read(store, FLAT_KEY) === 'on';
export const writeFlatHud = (store: Store, on: boolean): void => write(store, FLAT_KEY, on ? 'on' : 'off');
// The audio log transcript (#516): on unless the player turned it off.
export const readTranscript = (store: Store): boolean => read(store, TRANSCRIPT_KEY) !== 'off';
export const writeTranscript = (store: Store, on: boolean): void => write(store, TRANSCRIPT_KEY, on ? 'on' : 'off');

// The dark shell skin (#377): Scarab ridges unless the player picked another one of skins.ts.
export const readSkin = (store: Store): string => skinById(read(store, SKIN_KEY)).id;
export const writeSkin = (store: Store, id: string): void => write(store, SKIN_KEY, id);

// The pale glass skin (#377): Smoked glass unless the player picked another one of glassskins.ts.
export const readGlassSkin = (store: Store): string => glassSkinById(read(store, GLASS_KEY)).id;
export const writeGlassSkin = (store: Store, id: string): void => write(store, GLASS_KEY, id);

// The colorblind palette (#381): Default unless the player picked one.
export const readPalette = (store: Store): Palette => {
  const stored = read(store, PALETTE_KEY);
  return PALETTES.includes(stored as Palette) ? (stored as Palette) : 'default';
};
export const writePalette = (store: Store, palette: Palette): void => write(store, PALETTE_KEY, palette);

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
// evaluate and click wait seconds for a frame (bug #216). A draw a test asked for (`asked`) waits the 100 ms only: the
// first draw of a page compiles the shaders, and 4 times its cost made a test that waited for a draw wait 7 to 12 s
// (bug #435). A player draws every frame.
const AUTOMATED_MIN_GAP_MS = 100;
const AUTOMATED_DUTY = 4;
export const drawDue = (now: number, lastStart: number, lastCost: number, asked: boolean, automated: boolean): boolean =>
  !automated || now - lastStart >= Math.max(AUTOMATED_MIN_GAP_MS, asked ? 0 : AUTOMATED_DUTY * lastCost);

export function hasReflections(tier: Tier, automated: boolean): boolean {
  return !automated && tier === 'high';
}

// Geometry detail per tier (#424): low tier reduces vertex count on the 61 discs and 28 marbles for mobile fill/vertex savings.
export interface MeshDetail {
  discSegments: number;
  marbleWidthSegments: number;
  marbleHeightSegments: number;
}
export function meshDetail(tier: Tier): MeshDetail {
  return tier === 'low'
    ? { discSegments: 16, marbleWidthSegments: 16, marbleHeightSegments: 12 }
    : { discSegments: 32, marbleWidthSegments: 32, marbleHeightSegments: 16 };
}

// On mobile / low tier the canvas renders capped at 1.0 DPR: WebGL2 fills cost by pixels (#424).
// Even on high tier, DPR is capped at 2.0 to avoid 3x/4x retina waste.
// Under automation the canvas renders at half DPR (#349).
const AUTOMATED_PIXEL_RATIO = 0.5;
export const renderPixelRatio = (dpr: number, automated: boolean, tier: Tier = 'high'): number => {
  if (automated) return Math.min(dpr, AUTOMATED_PIXEL_RATIO);
  if (tier === 'low') return Math.min(dpr, 1.0);
  return Math.min(dpr, 2.0);
};

// Under automation (navigator.webdriver) we skip expensive effects like prefiltering and shadows (#459).
export const isAutomation = (webdriver: boolean): boolean => webdriver;

export interface ShadowSettings {
  enabled: boolean;
  soft: boolean;
}

// Shadows (#459): disabled under low quality tier and automation so software WebGL stays fast.
// Forced when requested for testing / screenshot captures.
export function shadowSettings(tier: Tier, automated: boolean, forced?: boolean): ShadowSettings {
  if (forced) return { enabled: true, soft: true };
  if (automated || tier === 'low') return { enabled: false, soft: false };
  return { enabled: true, soft: true };
}

/**
 * Airborne particles (#443): light dust/steam/smoke outside the board volume.
 * Disabled under clear board, reduced motion, low quality tier and automation.
 */
export function hasParticles(
  tier: Tier,
  clear: boolean,
  reducedMotion: boolean,
  automated: boolean,
  forced?: boolean,
): boolean {
  if (forced) return true;
  if (clear || reducedMotion || automated || tier === 'low') return false;
  return true;
}

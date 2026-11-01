// Quality tiers, fog and the clear-board setting, see docs/specs/tech.md section 5.1, and the volume
// sliders (docs/specs/world.md section 7).
// Pure functions only: main.ts feeds them the browser values.

import type { View } from './camera';
import { FRAME } from './frame';
import { glassSkinById } from './glassskins';
import type { Level } from './lightpanel';
import { PALETTES, type Palette } from './palettes';
import type { Theme } from './settings';
import type { Bus, Mix } from './sound';
import { skinById } from './skins';
import { UI_SCALES, type UiScale } from './uiscale';

export type Tier = 'low' | 'high';
export interface Hints {
  cores?: number;
  memory?: number;
  reducedMotion: boolean;
}
export type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

// Not 'ab-alone.quality': earlier versions stored their own guess there, which kept phones on the low tier (#882).
const TIER_KEY = 'ab-alone.tier';
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
const FOLD_KEY = 'ab-alone.hud-folded';
const TRANSCRIPT_KEY = 'ab-alone.transcript';
const STEERING_KEY = 'ab-alone.steering';

// The same rule on a phone as on a desktop (#882): only a weak device or reduced motion drops to the low tier.
export function tierFromHints({ cores, memory, reducedMotion }: Hints): Tier {
  if (reducedMotion) return 'low';
  const weak = (cores ?? Infinity) < 4 || (memory ?? Infinity) < 4;
  return weak ? 'low' : 'high';
}

// Linear fog on the depth along the view axis (THREE.Fog). It starts at the plate's edge, the farthest point of the
// frame's inner hexagon from the camera, and smoothly extends across the hauler bay (#665).
// It thickens into atmospheric haze, never over a cell, at every zoom and turn of the camera. `radius` is the frame's.
export const BAY_FOG_SPAN = 34;
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
// Under automation (navigator.webdriver, #990) the music starts at 0: a browser driven by Playwright would play it out loud.
// A volume the player saved still wins.
export const readMix = (store: Store, automated = false): Mix => {
  const muted = read(store, SOUND_KEY) === 'off';
  const volume = (bus: Bus): number => {
    const saved = read(store, volumeKey(bus)) ?? '';
    if (/^\d+$/.test(saved) && Number(saved) <= 100) return Number(saved);
    return muted || (automated && bus === 'music') ? 0 : DEFAULT_MIX[bus];
  };
  return { music: volume('music'), ambience: volume('ambience'), effects: volume('effects'), voice: volume('voice') };
};
export const writeVolume = (store: Store, bus: Bus, percent: number): void => write(store, volumeKey(bus), String(percent));
// The three light sliders (lightpanel.ts scalePower), 0 to 300 % of the tuned power each; until the player moves one,
// the levels the owner tuned in the game (2026-10-29).
export const DEFAULT_LEVELS: Readonly<Record<Level, number>> = { bloom: 20, lamps: 25, lights: 215 };
const levelKey = (level: Level): string => `ab-alone.light.${level}`;
export const readLevels = (store: Store): Record<Level, number> => {
  const level = (l: Level): number => {
    const saved = read(store, levelKey(l)) ?? '';
    return /^\d+$/.test(saved) && Number(saved) <= 300 ? Number(saved) : DEFAULT_LEVELS[l];
  };
  return { bloom: level('bloom'), lamps: level('lamps'), lights: level('lights') };
};
export const writeLevel = (store: Store, level: Level, percent: number): void => write(store, levelKey(level), String(percent));
// Photosensitivity safe mode (#380): on unless the player turned it off.
export const readSafeMode = (store: Store): boolean => read(store, SAFE_KEY) !== 'off';
export const writeSafeMode = (store: Store, on: boolean): void => write(store, SAFE_KEY, on ? 'on' : 'off');
// The UI scale (#382): 100 % unless the player picked a step.
export const readUiScale = (store: Store): UiScale => {
  const stored = Number(read(store, SCALE_KEY));
  return (UI_SCALES as readonly number[]).includes(stored) ? (stored as UiScale) : 100;
};
export const writeUiScale = (store: Store, scale: UiScale): void => write(store, SCALE_KEY, String(scale));
// The theme (#317, #1184): Dark unless the player picked System or Light. index.html reads the same key before the first paint.
export const readTheme = (store: Store): Theme => {
  const stored = read(store, THEME_KEY);
  return stored === 'system' || stored === 'light' ? stored : 'dark';
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
// The left HUD panel folded to a tab (#957): unfolded unless the player folded it.
export const readHudFolded = (store: Store): boolean => read(store, FOLD_KEY) === 'on';
export const writeHudFolded = (store: Store, on: boolean): void => write(store, FOLD_KEY, on ? 'on' : 'off');
// The audio log transcript (#516): on unless the player turned it off.
export const readTranscript = (store: Store): boolean => read(store, TRANSCRIPT_KEY) !== 'off';
export const writeTranscript = (store: Store, on: boolean): void => write(store, TRANSCRIPT_KEY, on ? 'on' : 'off');
// The Open world steering (#1137): the hero goes round obstacles and a far tap walks there; on unless the player turned it off.
export const readSteering = (store: Store): boolean => read(store, STEERING_KEY) !== 'off';
export const writeSteering = (store: Store, on: boolean): void => write(store, STEERING_KEY, on ? 'on' : 'off');

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

// A tier is stored only when asked for (?quality): the detected one is not, so a later rule applies at once (#882).
export function readTier(store: Store, hints: Hints): Tier {
  const stored = read(store, TIER_KEY);
  return stored === 'low' || stored === 'high' ? stored : tierFromHints(hints);
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

// A draw's cost runs from its start to the next animation frame, not to the end of render(): the GPU works after render()
// returns, and the frame after a draw comes late by its GPU time, about 0.4 to 1.1 s with software WebGL against 5 ms
// of JS (bug #921). WebGL's GPU timer query is missing there. The first frame after a draw times it (`timed` false).
export interface LastDraw {
  start: number;
  cost: number;
  timed: boolean;
}
export const timeDraw = (last: LastDraw, now: number): LastDraw =>
  last.timed ? last : { start: last.start, cost: now - last.start, timed: true };

// A player's page draws only when something asked for a frame (#848): the picture changed (`changed`: a move, an input,
// a load, a setting), an effect still moves (`moving`) or a test asked (`asked`). A still board leaves the GPU idle and
// the laptop cool. Under automation the throttle above decides alone, as before: the browser checks count draws.
export const drawWanted = (changed: boolean, moving: boolean, asked: boolean, automated: boolean): boolean =>
  automated || asked || changed || moving;

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

// Every tier caps the canvas at 1.5: a full-screen Retina window at 2 renders 3840×2160 and drew 10 FPS (#843), and a
// phone capped at 1.0 (#424) stretched each drawn pixel 3 times on a DPR-3 screen, a blur. The adaptive resolution
// below steps down when a phone is too slow for it.
// Under automation the canvas renders at half DPR (#349).
const AUTOMATED_PIXEL_RATIO = 0.5;
export const renderPixelRatio = (dpr: number, automated: boolean): number =>
  Math.min(dpr, automated ? AUTOMATED_PIXEL_RATIO : 1.5);

// FXAA smooths the edges (#857) where a drawn pixel is big (a ratio under 1.5) and the renderer has no MSAA, which
// a touch screen keeps.
export const smoothEdges = (drawnRatio: number, msaa: boolean): boolean => drawnRatio < 1.5 && !msaa;

// The adaptive resolution (#843): while the median frame of the last ones takes more than 20 ms (under 50 FPS), the
// pixel ratio steps down a quarter, never under `floor`. The median, so one long frame (a shader compile, a texture
// load) changes nothing. It never steps back up: with vsync a fast frame and a frame with room to spare look the same.
const SLOW_FRAME_MS = 20;
const RATIO_STEP = 0.25;
export function nextPixelRatio(ratio: number, frameMs: readonly number[], floor: number): number {
  const median = [...frameMs].sort((a, b) => a - b)[frameMs.length >> 1]!;
  return median > SLOW_FRAME_MS ? Math.max(floor, ratio - RATIO_STEP) : ratio;
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

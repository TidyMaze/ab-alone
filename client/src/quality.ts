// Quality tiers, fog and the clear-board setting, see docs/specs/tech.md section 5.1.
// Pure functions only: main.ts feeds them the browser values.

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

export function tierFromHints({ width, cores, memory, reducedMotion }: Hints): Tier {
  const weak = width < 768 || reducedMotion || (cores ?? Infinity) < 4 || (memory ?? Infinity) < 4;
  return weak ? 'low' : 'high';
}

// Linear fog that starts behind the far rim of the board (cells are at most ~16.5 from the camera).
const FOG = { low: { near: 17, far: 40 }, high: { near: 16.5, far: 30 } };

export function fogSettings(tier: Tier, clear: boolean): { near: number; far: number } | null {
  return clear ? null : FOG[tier];
}

function read(store: Store, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: Store, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Storage blocked (private mode, quota): the setting just lasts for this page view.
  }
}

export const readClearBoard = (store: Store): boolean => read(store, CLEAR_KEY) === 'on';
export const writeClearBoard = (store: Store, on: boolean): void => write(store, CLEAR_KEY, on ? 'on' : 'off');

export function readTier(store: Store, hints: Hints): Tier {
  const stored = read(store, TIER_KEY);
  if (stored === 'low' || stored === 'high') return stored;
  const tier = tierFromHints(hints);
  writeTier(store, tier);
  return tier;
}
export const writeTier = (store: Store, tier: Tier): void => write(store, TIER_KEY, tier);

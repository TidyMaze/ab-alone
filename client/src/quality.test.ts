import { describe, expect, it } from 'vitest';
import { axialTo3D, CELLS } from './board';
import { DIST_MAX, DIST_MIN, resetView, viewPosition, type View } from './camera';
import {
  drawDue,
  fogSettings,
  readClearBoard,
  readSound,
  readTier,
  tierFromHints,
  writeClearBoard,
  writeSound,
  writeTier,
} from './quality';

const big = { width: 1920, cores: 8, memory: 8, reducedMotion: false };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}
const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('tierFromHints', () => {
  it('is high on a big, capable screen', () => {
    expect(tierFromHints(big)).toBe('high');
  });
  it('is low on a small screen', () => {
    expect(tierFromHints({ ...big, width: 600 })).toBe('low');
  });
  it('is low when the user prefers reduced motion', () => {
    expect(tierFromHints({ ...big, reducedMotion: true })).toBe('low');
  });
  it('is low on few cores or little memory', () => {
    expect(tierFromHints({ ...big, cores: 2 })).toBe('low');
    expect(tierFromHints({ ...big, memory: 2 })).toBe('low');
  });
  it('ignores hints the browser does not give', () => {
    expect(tierFromHints({ width: 1920, reducedMotion: false })).toBe('high');
  });
});

describe('fogSettings', () => {
  const view = (distance: number): View => ({ ...resetView(), distance });
  // Fog is linear on the depth along the view axis, like THREE.Fog.
  const factor = (f: { near: number; far: number }, depth: number): number =>
    Math.min(1, Math.max(0, (depth - f.near) / (f.far - f.near)));
  // Depth of every cell centre for a camera that looks at the board centre.
  const depths = (v: View): number[] => {
    const c = viewPosition(v);
    const len = Math.hypot(c.x, c.y, c.z);
    return CELLS.map(([q, r]) => {
      const p = axialTo3D(q, r);
      return ((p.x - c.x) * -c.x + (p.y - c.y) * -c.y + (p.z - c.z) * -c.z) / len;
    });
  };
  const zooms = [DIST_MIN, resetView().distance, DIST_MAX];

  for (const tier of ['low', 'high'] as const) {
    for (const distance of zooms) {
      it(`${tier}: fogs the far rim and spares the near cells at distance ${distance.toFixed(1)}`, () => {
        const fog = fogSettings(tier, false, distance)!;
        const d = depths(view(distance));
        expect(factor(fog, Math.max(...d))).toBeGreaterThanOrEqual(0.25);
        expect(factor(fog, Math.min(...d))).toBeLessThanOrEqual(0.05);
      });
    }
  }
  it('is lighter on low than on high', () => {
    const low = fogSettings('low', false, resetView().distance)!;
    const high = fogSettings('high', false, resetView().distance)!;
    expect(low.far).toBeGreaterThanOrEqual(high.far);
  });
  it('is off in clear-board mode, in every tier', () => {
    expect(fogSettings('low', true, resetView().distance)).toBeNull();
    expect(fogSettings('high', true, resetView().distance)).toBeNull();
  });
});

describe('clear-board storage', () => {
  it('defaults to off', () => {
    expect(readClearBoard(memoryStorage())).toBe(false);
  });
  it('writes then reads back', () => {
    const s = memoryStorage();
    writeClearBoard(s, true);
    expect(readClearBoard(s)).toBe(true);
    writeClearBoard(s, false);
    expect(readClearBoard(s)).toBe(false);
  });
  it('falls back to off when storage throws or is missing', () => {
    expect(readClearBoard(throwing)).toBe(false);
    expect(readClearBoard(null)).toBe(false);
  });
  it('does not throw when writing to a broken or missing storage', () => {
    expect(() => writeClearBoard(throwing, true)).not.toThrow();
    expect(() => writeClearBoard(null, true)).not.toThrow();
  });
});

describe('sound storage, the on/off toggle until the mix sliders of #60', () => {
  it('defaults to on', () => {
    expect(readSound(memoryStorage())).toBe(true);
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeSound(s, false);
    expect(s.data.get('ab-alone.sound')).toBe('off');
    expect(readSound(s)).toBe(false);
    writeSound(s, true);
    expect(s.data.get('ab-alone.sound')).toBe('on');
    expect(readSound(s)).toBe(true);
  });
  it('ignores a garbage stored value: on', () => {
    expect(readSound(memoryStorage({ 'ab-alone.sound': 'loud' }))).toBe(true);
  });
  it('falls back to on when storage throws or is missing', () => {
    expect(readSound(throwing)).toBe(true);
    expect(readSound(null)).toBe(true);
  });
  it('does not throw when writing to a broken or missing storage', () => {
    expect(() => writeSound(throwing, false)).not.toThrow();
    expect(() => writeSound(null, false)).not.toThrow();
  });
});

describe('tier storage', () => {
  it('uses the device default when nothing is stored, and stores it', () => {
    const s = memoryStorage();
    expect(readTier(s, { ...big, width: 600 })).toBe('low');
    expect(s.data.get('ab-alone.quality')).toBe('low');
  });
  it('prefers a stored valid tier over the device default', () => {
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'low' }), big)).toBe('low');
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'high' }), { ...big, width: 600 })).toBe('high');
  });
  it('ignores a garbage stored value', () => {
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'ultra' }), big)).toBe('high');
  });
  it('falls back to the device default when storage throws', () => {
    expect(readTier(throwing, big)).toBe('high');
    expect(readTier(null, { ...big, width: 600 })).toBe('low');
  });
  it('writeTier stores and survives a broken storage', () => {
    const s = memoryStorage();
    writeTier(s, 'high');
    expect(s.data.get('ab-alone.quality')).toBe('high');
    expect(() => writeTier(throwing, 'low')).not.toThrow();
    expect(() => writeTier(null, 'low')).not.toThrow();
  });
});

describe('drawDue', () => {
  it('draws every frame for a player, whatever the draw cost', () => {
    expect(drawDue(1000, 999, 500, false)).toBe(true);
  });
  it('draws at most 10 times a second under automation', () => {
    expect(drawDue(1099, 1000, 5, true)).toBe(false);
    expect(drawDue(1100, 1000, 5, true)).toBe(true);
  });
  it('waits four times a slow draw under automation, so software WebGL leaves the CPU to the input', () => {
    expect(drawDue(1799, 1000, 200, true)).toBe(false);
    expect(drawDue(1800, 1000, 200, true)).toBe(true);
  });
});

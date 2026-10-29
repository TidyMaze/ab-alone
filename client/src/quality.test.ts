import { describe, expect, it } from 'vitest';
import { axialTo3D, CELLS, VANISHED } from './board';
import { DIST_MAX, DIST_MIN, POLAR_MAX, POLAR_MIN, resetView, viewPosition, type View } from './camera';
import { frameShape } from './frame';
import {
  drawDue,
  fogSettings,
  readClearBoard,
  readFps,
  writeFps,
  hasReflections,
  meshDetail,
  renderPixelRatio,
  nextPixelRatio,
  readFlatHud,
  readTranscript,
  readReducedMotion,
  readGlassSkin,
  readSafeMode,
  readMix,
  readLevels,
  writeLevel,
  readSkin,
  readPalette,
  readTheme,
  readTier,
  readUiScale,
  tierFromHints,
  isAutomation,
  hasParticles,
  shadowSettings,
  writeClearBoard,
  writeGlassSkin,
  writePalette,
  writeSafeMode,
  writeVolume,
  writeFlatHud,
  writeTranscript,
  writeReducedMotion,
  writeSkin,
  writeTheme,
  writeTier,
  writeUiScale,
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
  it('is high on a capable modern phone (6+ cores, 4+ GB RAM) (#655)', () => {
    expect(tierFromHints({ ...big, width: 390, cores: 6, memory: 4 })).toBe('high');
    expect(tierFromHints({ ...big, width: 412, cores: 8, memory: 8 })).toBe('high');
  });
  it('is low on a budget mobile screen (< 6 cores or < 4 GB RAM) (#655)', () => {
    expect(tierFromHints({ ...big, width: 600, cores: 4, memory: 2 })).toBe('low');
    expect(tierFromHints({ ...big, width: 390, cores: 4, memory: 4 })).toBe('low');
    expect(tierFromHints({ ...big, width: 390, cores: 6, memory: 2 })).toBe('low');
    expect(tierFromHints({ width: 390, cores: 6, reducedMotion: false })).toBe('low');
    expect(tierFromHints({ width: 390, memory: 4, reducedMotion: false })).toBe('low');
  });
  it('is low on a tiny screen (< 360 px)', () => {
    expect(tierFromHints({ ...big, width: 320 })).toBe('low');
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
  // Fog is linear on the depth along the view axis, like THREE.Fog.
  const factor = (f: { near: number; far: number }, depth: number): number =>
    Math.min(1, Math.max(0, (depth - f.near) / (f.far - f.near)));
  // Depth of a point of the board plane for a camera that looks at the board centre.
  const depth = (v: View, x: number, z: number): number => {
    const c = viewPosition(v);
    const len = Math.hypot(c.x, c.y, c.z);
    return ((x - c.x) * -c.x + -c.y * -c.y + (z - c.z) * -c.z) / len;
  };
  const DISC = 0.46; // a cell disc's radius (main.ts)
  const ring = ([q, r]: readonly [number, number]): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const views: View[] = [];
  for (let k = 0; k < 24; k++) {
    for (const polar of [POLAR_MIN, resetView().polar, POLAR_MAX]) {
      for (const distance of [DIST_MIN, resetView().distance, DIST_MAX]) views.push({ azimuth: (k * Math.PI) / 12, polar, distance, aside: 0 });
    }
  }

  // Bug #399: the fog was over the far rim cells. At every view, for the full board and The Choir's radius 3.
  for (const tier of ['low', 'high'] as const) {
    for (const radius of [4, 3]) {
      const cells = CELLS.filter((c) => ring(c) <= radius);
      const outer = frameShape(CELLS.map((c) => (ring(c) > radius ? VANISHED : 0))).outer;
      it(`${tier}, radius ${radius}: never over a cell, gentle at the rim, extends into bay (#665)`, () => {
        for (const v of views) {
          const fog = fogSettings(tier, false, v, radius, 1)!;
          const reach = DISC * Math.sin(v.polar); // the disc's farthest point from its centre, along the view
          const cellDepth = Math.max(...cells.map(([q, r]) => depth(v, axialTo3D(q, r).x, axialTo3D(q, r).z) + reach));
          expect(factor(fog, cellDepth)).toBe(0);
          expect(factor(fog, Math.max(...outer.map((p) => depth(v, p.x, p.z))))).toBeLessThan(0.05);
          expect(fog.far - fog.near).toBeGreaterThanOrEqual(30);
        }
      });
    }
  }
  it('is lighter on low than on high', () => {
    const low = fogSettings('low', false, resetView(), 4, 1)!;
    const high = fogSettings('high', false, resetView(), 4, 1)!;
    expect(low.near).toBe(high.near);
    expect(low.far).toBeGreaterThan(high.far);
  });
  it('extends far smoothly to 45m+ at default view on standard density (#665)', () => {
    const fog = fogSettings('high', false, resetView(), 4, 1)!;
    expect(fog.far).toBeGreaterThanOrEqual(45);
  });
  // #400: a deck's density thickens the fog over the rim, from the same start: never over a cell on any deck.
  it('a denser deck fog starts at the same edge and is thick sooner, at every view', () => {
    for (const v of views) {
      const haze = fogSettings('high', false, v, 4, 1)!;
      const steam = fogSettings('high', false, v, 4, 2)!;
      expect(steam.near).toBe(haze.near);
      expect(steam.far - steam.near).toBeCloseTo((haze.far - haze.near) / 2);
    }
  });
  it('is off in clear-board mode, in every tier and on every deck', () => {
    for (const density of [0.3, 1, 2]) {
      expect(fogSettings('low', true, resetView(), 4, density)).toBeNull();
      expect(fogSettings('high', true, resetView(), 4, density)).toBeNull();
    }
  });
});

describe('shell skin storage: Scarab ridges unless the player picked another', () => {
  it('defaults to scarab, reads back what was written, under its own key', () => {
    const s = memoryStorage();
    expect(readSkin(s)).toBe('scarab');
    writeSkin(s, 'hex');
    expect(s.data.get('ab-alone.shell-skin')).toBe('hex');
    expect(readSkin(s)).toBe('hex');
  });
  it('ignores an unknown stored id, and survives storage that throws or is missing', () => {
    expect(readSkin(memoryStorage({ 'ab-alone.shell-skin': 'gold' }))).toBe('scarab');
    expect(readSkin(throwing)).toBe('scarab');
    expect(readSkin(null)).toBe('scarab');
    expect(() => writeSkin(throwing, 'hex')).not.toThrow();
  });
});

describe('glass skin storage: Smoked glass unless the player picked another', () => {
  it('defaults to smoked, reads back what was written, under its own key', () => {
    const s = memoryStorage();
    expect(readGlassSkin(s)).toBe('smoked');
    writeGlassSkin(s, 'frost');
    expect(s.data.get('ab-alone.glass-skin')).toBe('frost');
    expect(readGlassSkin(s)).toBe('frost');
  });
  it('ignores an unknown stored id, and survives storage that throws or is missing', () => {
    expect(readGlassSkin(memoryStorage({ 'ab-alone.glass-skin': 'gold' }))).toBe('smoked');
    expect(readGlassSkin(throwing)).toBe('smoked');
    expect(readGlassSkin(null)).toBe('smoked');
    expect(() => writeGlassSkin(throwing, 'frost')).not.toThrow();
  });
});

describe('theme storage: System unless the player picked Dark or Light', () => {
  it('defaults to system', () => {
    expect(readTheme(memoryStorage())).toBe('system');
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeTheme(s, 'light');
    expect(s.data.get('ab-alone.theme')).toBe('light');
    expect(readTheme(s)).toBe('light');
    writeTheme(s, 'system');
    expect(readTheme(s)).toBe('system');
  });
  it('ignores a garbage stored value: system', () => {
    expect(readTheme(memoryStorage({ 'ab-alone.theme': 'blue' }))).toBe('system');
  });
  it('falls back to system when storage throws or is missing, and does not throw writing', () => {
    expect(readTheme(throwing)).toBe('system');
    expect(readTheme(null)).toBe('system');
    expect(() => writeTheme(throwing, 'dark')).not.toThrow();
    expect(() => writeTheme(null, 'dark')).not.toThrow();
  });
});

describe('palette storage: default unless the player picked one', () => {
  it('defaults to default', () => {
    expect(readPalette(memoryStorage())).toBe('default');
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writePalette(s, 'protan');
    expect(s.data.get('ab-alone.palette')).toBe('protan');
    expect(readPalette(s)).toBe('protan');
  });
  it('ignores garbage value and falls back to default', () => {
    expect(readPalette(memoryStorage({ 'ab-alone.palette': 'invalid' }))).toBe('default');
  });
  it('falls back to default when storage throws or is missing', () => {
    expect(readPalette(throwing)).toBe('default');
    expect(readPalette(null)).toBe('default');
    expect(() => writePalette(throwing, 'protan')).not.toThrow();
    expect(() => writePalette(null, 'protan')).not.toThrow();
  });
});

describe('FPS readout storage (#426)', () => {
  it('is off by default, and off when storage throws or is missing', () => {
    expect(readFps(memoryStorage())).toBe(false);
    expect(readFps(throwing)).toBe(false);
    expect(readFps(null)).toBe(false);
  });
  it('writes then reads back, and a blocked write does not throw', () => {
    const s = memoryStorage();
    writeFps(s, true);
    expect(readFps(s)).toBe(true);
    writeFps(s, false);
    expect(readFps(s)).toBe(false);
    expect(() => writeFps(throwing, true)).not.toThrow();
  });
});

describe('transcript storage (#516): on unless the player turned it off', () => {
  it('defaults to on', () => {
    expect(readTranscript(memoryStorage())).toBe(true);
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeTranscript(s, false);
    expect(s.data.get('ab-alone.transcript')).toBe('off');
    expect(readTranscript(s)).toBe(false);
    writeTranscript(s, true);
    expect(s.data.get('ab-alone.transcript')).toBe('on');
    expect(readTranscript(s)).toBe(true);
  });
  it('falls back to on when storage throws or is missing, and does not throw writing', () => {
    expect(readTranscript(throwing)).toBe(true);
    expect(readTranscript(null)).toBe(true);
    expect(() => writeTranscript(throwing, false)).not.toThrow();
  });
});

describe('flat HUD storage (#391): off unless the player turned it on', () => {
  it('defaults to off', () => {
    expect(readFlatHud(memoryStorage())).toBe(false);
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeFlatHud(s, true);
    expect(s.data.get('ab-alone.flat-hud')).toBe('on');
    expect(readFlatHud(s)).toBe(true);
    writeFlatHud(s, false);
    expect(s.data.get('ab-alone.flat-hud')).toBe('off');
    expect(readFlatHud(s)).toBe(false);
  });
  it('falls back to off when storage throws or is missing, and does not throw writing', () => {
    expect(readFlatHud(throwing)).toBe(false);
    expect(readFlatHud(null)).toBe(false);
    expect(() => writeFlatHud(throwing, true)).not.toThrow();
    expect(() => writeFlatHud(null, true)).not.toThrow();
  });
});

describe('reduced motion storage (#379): no choice until the player presses the toggle', () => {
  it('defaults to no choice, so the system setting decides', () => {
    expect(readReducedMotion(memoryStorage())).toBeNull();
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeReducedMotion(s, true);
    expect(s.data.get('ab-alone.reduced-motion')).toBe('on');
    expect(readReducedMotion(s)).toBe(true);
    writeReducedMotion(s, false);
    expect(s.data.get('ab-alone.reduced-motion')).toBe('off');
    expect(readReducedMotion(s)).toBe(false);
  });
  it('ignores a garbage stored value: no choice', () => {
    expect(readReducedMotion(memoryStorage({ 'ab-alone.reduced-motion': 'slow' }))).toBeNull();
  });
  it('falls back to no choice when storage throws or is missing, and does not throw writing', () => {
    expect(readReducedMotion(throwing)).toBeNull();
    expect(readReducedMotion(null)).toBeNull();
    expect(() => writeReducedMotion(throwing, true)).not.toThrow();
    expect(() => writeReducedMotion(null, true)).not.toThrow();
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

describe('the three light sliders: bloom, lamps, lights', () => {
  it('defaults to the levels the owner tuned (bloom 20, lamps 25, lights 215 %), and reads back a saved slider under its own key', () => {
    const s = memoryStorage();
    expect(readLevels(s)).toEqual({ bloom: 20, lamps: 25, lights: 215 });
    writeLevel(s, 'lamps', 250);
    writeLevel(s, 'bloom', 0);
    expect(s.data.get('ab-alone.light.lamps')).toBe('250');
    expect(readLevels(s)).toEqual({ bloom: 0, lamps: 250, lights: 215 });
  });
  it('ignores a garbage stored value, and a stored value over 300 %: the default', () => {
    for (const bad of ['bright', '', '-5', '301', '50.5']) expect(readLevels(memoryStorage({ 'ab-alone.light.lights': bad })).lights).toBe(215);
  });
  it('falls back to the default when storage throws or is missing, and does not throw when writing to it', () => {
    expect(readLevels(throwing).bloom).toBe(20);
    expect(readLevels(null).bloom).toBe(20);
    expect(() => writeLevel(throwing, 'bloom', 0)).not.toThrow();
    expect(() => writeLevel(null, 'bloom', 0)).not.toThrow();
  });
});

describe('mix storage, the four volume sliders (#438)', () => {
  it('defaults to music, effects and voice at 100 %, ambience at 5 %', () => {
    expect(readMix(memoryStorage())).toEqual({ music: 100, ambience: 5, effects: 100, voice: 100 });
  });
  it('writes then reads back each slider, under its own key', () => {
    const s = memoryStorage();
    writeVolume(s, 'music', 30);
    writeVolume(s, 'voice', 0);
    expect(s.data.get('ab-alone.volume.music')).toBe('30');
    expect(s.data.get('ab-alone.volume.voice')).toBe('0');
    expect(readMix(s)).toEqual({ music: 30, ambience: 5, effects: 100, voice: 0 });
  });
  it('maps an old saved Sound off to every slider at 0, and on to defaults', () => {
    expect(readMix(memoryStorage({ 'ab-alone.sound': 'off' }))).toEqual({ music: 0, ambience: 0, effects: 0, voice: 0 });
    expect(readMix(memoryStorage({ 'ab-alone.sound': 'on' }))).toEqual({ music: 100, ambience: 5, effects: 100, voice: 100 });
  });
  it('a slider saved since wins over the old Sound off', () => {
    const s = memoryStorage({ 'ab-alone.sound': 'off' });
    writeVolume(s, 'effects', 70);
    expect(readMix(s)).toEqual({ music: 0, ambience: 0, effects: 70, voice: 0 });
  });
  it('ignores a garbage stored value: the default of that slider', () => {
    for (const bad of ['loud', '', '-5', '101', '50.5']) {
      expect(readMix(memoryStorage({ 'ab-alone.volume.music': bad })).music).toBe(100);
    }
  });
  it('falls back to 100 % when storage throws or is missing', () => {
    expect(readMix(throwing).effects).toBe(100);
    expect(readMix(null).effects).toBe(100);
  });
  it('does not throw when writing to a broken or missing storage', () => {
    expect(() => writeVolume(throwing, 'music', 0)).not.toThrow();
    expect(() => writeVolume(null, 'music', 0)).not.toThrow();
  });
});

describe('safe mode storage: on unless the player turned it off (#380)', () => {
  it('defaults to on', () => {
    expect(readSafeMode(memoryStorage())).toBe(true);
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeSafeMode(s, false);
    expect(s.data.get('ab-alone.safe-mode')).toBe('off');
    expect(readSafeMode(s)).toBe(false);
    writeSafeMode(s, true);
    expect(readSafeMode(s)).toBe(true);
  });
  it('falls back to on when storage throws or is missing', () => {
    expect(readSafeMode(throwing)).toBe(true);
    expect(readSafeMode(null)).toBe(true);
  });
});

describe('UI scale storage: 100 % unless the player picked a step (#382)', () => {
  it('defaults to 100', () => {
    expect(readUiScale(memoryStorage())).toBe(100);
  });
  it('writes then reads back, under its own key', () => {
    const s = memoryStorage();
    writeUiScale(s, 175);
    expect(s.data.get('ab-alone.ui-scale')).toBe('175');
    expect(readUiScale(s)).toBe(175);
  });
  it('ignores a value that is not a step', () => {
    expect(readUiScale(memoryStorage({ 'ab-alone.ui-scale': '300' }))).toBe(100);
    expect(readUiScale(memoryStorage({ 'ab-alone.ui-scale': 'big' }))).toBe(100);
  });
  it('falls back to 100 when storage throws or is missing', () => {
    expect(readUiScale(throwing)).toBe(100);
    expect(readUiScale(null)).toBe(100);
    expect(() => writeUiScale(throwing, 200)).not.toThrow();
  });
});

describe('tier storage', () => {
  it('uses the device default when nothing is stored, and stores it', () => {
    const s = memoryStorage();
    expect(readTier(s, { ...big, width: 600, cores: 4 })).toBe('low');
    expect(s.data.get('ab-alone.quality')).toBe('low');
  });
  it('prefers a stored valid tier over the device default', () => {
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'low' }), big)).toBe('low');
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'high' }), { ...big, width: 600, cores: 4 })).toBe('high');
  });
  it('ignores a garbage stored value', () => {
    expect(readTier(memoryStorage({ 'ab-alone.quality': 'ultra' }), big)).toBe('high');
  });
  it('falls back to the device default when storage throws', () => {
    expect(readTier(throwing, big)).toBe('high');
    expect(readTier(null, { ...big, width: 600, cores: 4 })).toBe('low');
  });
  it('writeTier stores and survives a broken storage', () => {
    const s = memoryStorage();
    writeTier(s, 'high');
    expect(s.data.get('ab-alone.quality')).toBe('high');
    expect(() => writeTier(throwing, 'low')).not.toThrow();
    expect(() => writeTier(null, 'low')).not.toThrow();
  });
});

describe('renderPixelRatio (#424)', () => {
  it('gives a phone up to 1.5 like any player: at 1 a DPR-3 screen stretched every drawn pixel 3 times, a blur', () => {
    expect(renderPixelRatio(3, false)).toBe(1.5);
    expect(renderPixelRatio(0.8, false)).toBe(0.8);
  });
  it('caps every player at 1.5 DPR: a full-screen Retina window at 2 drew 10 FPS (#843)', () => {
    expect(renderPixelRatio(1, false)).toBe(1);
    expect(renderPixelRatio(2, false)).toBe(1.5);
    expect(renderPixelRatio(3, false)).toBe(1.5);
  });
  it('renders at half the pixels under automation, so software WebGL costs less per frame', () => {
    expect(renderPixelRatio(1, true)).toBe(0.5);
    expect(renderPixelRatio(2, true)).toBe(0.5);
  });
  it('never renders above the device ratio under automation', () => {
    expect(renderPixelRatio(0.5, true)).toBe(0.5);
  });
});

describe('nextPixelRatio, the adaptive resolution (#843)', () => {
  const frames = (ms: number, n = 30): number[] => Array.from({ length: n }, () => ms);
  it('steps down by a quarter while the frames take more than 20 ms', () => {
    expect(nextPixelRatio(1.5, frames(40), 1)).toBe(1.25);
    expect(nextPixelRatio(1.25, frames(21), 1)).toBe(1);
  });
  it('keeps the ratio while the frames are fast enough', () => {
    expect(nextPixelRatio(1.5, frames(16.7), 1)).toBe(1.5);
    expect(nextPixelRatio(1.5, frames(20), 1)).toBe(1.5);
  });
  it('never goes under the floor', () => {
    expect(nextPixelRatio(1, frames(50), 1)).toBe(1);
    expect(nextPixelRatio(1.1, frames(50), 1)).toBe(1);
  });
  it('reads the median: one long frame (a shader compile, a texture load) changes nothing', () => {
    expect(nextPixelRatio(1.5, [...frames(16, 29), 8000], 1)).toBe(1.5);
  });
});

describe('mobile quality optimizations (#424)', () => {
  it('hasReflections returns true on high tier only, skipping PMREM on low tier and automation', () => {
    expect(hasReflections('high', false)).toBe(true);
    expect(hasReflections('low', false)).toBe(false);
    expect(hasReflections('high', true)).toBe(false);
    expect(hasReflections('low', true)).toBe(false);
  });

  it('meshDetail reduces geometry segments on low tier / mobile', () => {
    const low = meshDetail('low');
    expect(low.discSegments).toBe(16);
    expect(low.marbleWidthSegments).toBe(16);
    expect(low.marbleHeightSegments).toBe(12);

    const high = meshDetail('high');
    expect(high.discSegments).toBe(32);
    expect(high.marbleWidthSegments).toBe(32);
    expect(high.marbleHeightSegments).toBe(16);
  });
});

describe('drawDue', () => {
  it('draws every frame for a player, whatever the draw cost', () => {
    expect(drawDue(1000, 999, 500, false, false)).toBe(true);
  });
  it('draws at most 10 times a second under automation', () => {
    expect(drawDue(1099, 1000, 5, false, true)).toBe(false);
    expect(drawDue(1100, 1000, 5, false, true)).toBe(true);
  });
  it('waits four times a slow draw under automation, so software WebGL leaves the CPU to the input', () => {
    expect(drawDue(1799, 1000, 200, false, true)).toBe(false);
    expect(drawDue(1800, 1000, 200, false, true)).toBe(true);
  });
  it('does not hold a draw a test asked for behind a slow draw, the one that compiled the shaders, bug #435', () => {
    expect(drawDue(1099, 1000, 3000, true, true)).toBe(false);
    expect(drawDue(1100, 1000, 3000, true, true)).toBe(true);
  });
});

describe('isAutomation and shadowSettings (#459)', () => {
  it('identifies automation from webdriver flag', () => {
    expect(isAutomation(true)).toBe(true);
    expect(isAutomation(false)).toBe(false);
  });

  it('disables shadows under low tier', () => {
    expect(shadowSettings('low', false)).toEqual({ enabled: false, soft: false });
  });

  it('disables shadows under automation to save software WebGL', () => {
    expect(shadowSettings('high', true)).toEqual({ enabled: false, soft: false });
    expect(shadowSettings('low', true)).toEqual({ enabled: false, soft: false });
  });

  it('enables soft shadows under high tier for players', () => {
    expect(shadowSettings('high', false)).toEqual({ enabled: true, soft: true });
  });

  it('allows forcing shadows on under automation for testing/screenshots', () => {
    expect(shadowSettings('low', true, true)).toEqual({ enabled: true, soft: true });
    expect(shadowSettings('high', true, true)).toEqual({ enabled: true, soft: true });
  });

  describe('hasParticles (#443)', () => {
    it('enables particles for high tier when clear, reduced motion and automation are off', () => {
      expect(hasParticles('high', false, false, false)).toBe(true);
    });

    it('disables particles under low quality tier', () => {
      expect(hasParticles('low', false, false, false)).toBe(false);
    });

    it('disables particles under clear board', () => {
      expect(hasParticles('high', true, false, false)).toBe(false);
    });

    it('disables particles under reduced motion', () => {
      expect(hasParticles('high', false, true, false)).toBe(false);
    });

    it('disables particles under automation to save software WebGL', () => {
      expect(hasParticles('high', false, false, true)).toBe(false);
    });

    it('allows forcing particles on under automation for tests/screenshots', () => {
      expect(hasParticles('low', false, false, true, true)).toBe(true);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { ACCENTS, CORE, type Accent, coreLevel, GLASS, SEAT_GLYPHS, SEAT_INK, SEATS, SHELL } from './marbles';
import { PALETTE_DEFS } from './palettes';
import { SKINS } from './skins';

// Relative luminance and contrast ratio (WCAG 2), on 0xrrggbb colours.
const channels = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => v / 255);
const linear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: number[]): number => 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
// The three common colour-blind simulations (Machado et al. 2009, severity 1), on sRGB channels.
const SIMULATIONS: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (m: number[][], c: number[]): number[] =>
  m.map((row) => Math.min(1, Math.max(0, row.reduce((s, k, i) => s + k * c[i]!, 0))));

// docs/specs/world.md section 5: the player is smoked glass with a cyan core, the enemy a matte ridged shell, no core.
describe('marble looks, world.md section 5', () => {
  it('the core is the cold cyan of the palette, small inside the 0.36 marble', () => {
    expect(CORE.color).toBe(0x7fd6e8);
    expect(CORE.radius).toBeGreaterThan(0);
    expect(CORE.radius).toBeLessThan(0.36 / 2);
  });

  it('the glass is see-through and smoked: darker than the pale bone-white it was', () => {
    expect(GLASS.transparent).toBe(true);
    expect(GLASS.opacity).toBeGreaterThan(0);
    expect(GLASS.opacity).toBeLessThan(1);
    expect(luminance(channels(GLASS.color))).toBeLessThan(luminance(channels(0xd8d4c8)) / 4);
  });

  it('the shell is matte and ridged, nothing emissive, no core', () => {
    expect(SHELL.roughness).toBeGreaterThanOrEqual(0.5);
    expect(SHELL.ridges).toBeGreaterThan(0);
    expect(SHELL).not.toHaveProperty('emissive');
    expect(SHELL).not.toHaveProperty('core');
  });

  it('the core stands out from the shell at 3:1 in greyscale (#26)', () => {
    expect(contrast(channels(CORE.color), channels(SHELL.color))).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.keys(SIMULATIONS))('the core stands out from the shell at 3:1 under %s simulation (#26)', (name) => {
    const m = SIMULATIONS[name]!;
    expect(contrast(simulate(m, channels(CORE.color)), simulate(m, channels(SHELL.color)))).toBeGreaterThanOrEqual(3);
  });
});

// #506: the cyan core dims one step per marble lost (world.md section 5), never fully dark.
describe('the dimming core', () => {
  it('is fully lit while no marble is lost', () => {
    expect(coreLevel(0, 6)).toBe(1);
  });

  it('dims one even step per marble lost, down to its floor at the losing marble', () => {
    const levels = [0, 1, 2, 3, 4, 5, 6].map((lost) => coreLevel(lost, 6));
    const steps = levels.slice(1).map((level, i) => levels[i]! - level);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 10);
    expect(steps[0]).toBeGreaterThan(0);
    expect(levels[6]).toBe(CORE.floor);
  });

  it('never goes fully dark', () => {
    expect(CORE.floor).toBeGreaterThan(0);
    expect(coreLevel(9, 6)).toBe(CORE.floor);
  });

  it('the dimmest core, seen through the glass, still stands out from the shell at 3:1 (#344)', () => {
    const [core, glass] = [channels(CORE.color), channels(GLASS.color)];
    const dim = core.map((v, i) => CORE.floor * v + (1 - CORE.floor) * glass[i]!);
    expect(contrast(dim, channels(SHELL.color))).toBeGreaterThanOrEqual(3);
  });
});

// Battle royale (#49, #501): one shell tint per seat, world.md section 5. A glyph tells the seats apart too, never the
// colour alone, but the tints stay apart and readable on the deck for every colour vision.
describe('battle royale seat tints', () => {
  const deck = channels(0x0b0d0f);
  const views: Record<string, (c: number[]) => number[]> = {
    normal: (c) => c,
    ...Object.fromEntries(Object.entries(SIMULATIONS).map(([name, m]) => [name, (c: number[]) => simulate(m, c)])),
  };

  it('has six distinct tints', () => {
    expect(SEATS).toHaveLength(6);
    expect(new Set(SEATS).size).toBe(6);
  });

  it.each(Object.keys(views))('every tint stands out from the deck at 3:1 in %s vision', (name) => {
    for (const seat of SEATS) {
      expect(contrast(views[name]!(channels(seat)), deck), seat.toString(16)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.keys(views))('no two tints look alike in %s vision', (name) => {
    const seen = SEATS.map((seat) => views[name]!(channels(seat)));
    seen.forEach((a, i) =>
      seen.slice(i + 1).forEach((b) => expect(Math.hypot(...a.map((v, k) => v - b[k]!))).toBeGreaterThanOrEqual(0.15)),
    );
  });
});

// #558: each seat's marbles wear an engraved glyph as well as the tint, so no two seats tell apart by colour alone
// (world.md section 5): under the Furnace light You, Bot 3 and Bot 4 read close.
describe('battle royale seat glyphs', () => {
  const views: Record<string, (c: number[]) => number[]> = {
    normal: (c) => c,
    ...Object.fromEntries(Object.entries(SIMULATIONS).map(([name, m]) => [name, (c: number[]) => simulate(m, c)])),
  };

  it('gives each seat its own glyph, in seat order', () => {
    expect(SEAT_GLYPHS.map((g) => g.name)).toEqual(['disc', 'triangle', 'square', 'cross', 'star', 'diamond']);
    expect(new Set(SEAT_GLYPHS.map((g) => JSON.stringify(g.points))).size).toBe(SEATS.length);
  });

  it('draws each glyph as an outline of at least 3 points inside the unit circle', () => {
    for (const { name, points } of SEAT_GLYPHS) {
      expect(points.length, name).toBeGreaterThanOrEqual(3);
      for (const [x, y] of points) expect(Math.hypot(x, y), name).toBeLessThanOrEqual(1);
    }
  });

  it.each(Object.keys(views))('the ink reads 3:1 on every seat tint in %s vision', (name) => {
    const see = views[name]!;
    for (const seat of SEATS) expect(contrast(see(channels(seat)), see(channels(SEAT_INK))), seat.toString(16)).toBeGreaterThanOrEqual(3);
  });
});

// #507: in boss mode the boss side's shells wear their boss's accent (world.md section 5, lead decision on the issue).
describe('boss accents', () => {
  it('gives The Hull a rust crown, The Chaplain candle wax, The Ballast Mind a wire wrap', () => {
    expect(Object.fromEntries(Object.entries(ACCENTS).map(([boss, a]) => [boss, a.name]))).toEqual({
      hull: 'crown',
      chaplain: 'wax',
      ballast: 'wire',
    });
  });

  it('leaves The Echo and The Choir the plain shell (the Choir army glyphs are its shape cue)', () => {
    expect(ACCENTS).not.toHaveProperty('echo');
    expect(ACCENTS).not.toHaveProperty('choir');
  });

  // How far out of the marble's centre it reaches: a cylinder's top, a ring's outer edge.
  const reach = (a: Accent): number => (a.shape === 'cylinder' ? a.y + a.args[2] / 2 : a.args[0] + a.args[1]);
  it.each(Object.values(ACCENTS))('adds to the silhouette: the $name stands out of the 0.36 shell', (a) => {
    expect(reach(a)).toBeGreaterThan(0.36);
  });

  // The shell under the accent: every palette's (#381) and every skin's base colour (#377).
  const shells = [...Object.values(PALETTE_DEFS).map((p) => p.shell), ...SKINS.map((s) => s.color)];
  const views: Record<string, (c: number[]) => number[]> = {
    normal: (c) => c,
    ...Object.fromEntries(Object.entries(SIMULATIONS).map(([name, m]) => [name, (c: number[]) => simulate(m, c)])),
  };
  it.each(Object.keys(views))('every accent stands out from every shell at 3:1 in %s vision', (name) => {
    for (const a of Object.values(ACCENTS)) {
      for (const shell of shells) {
        const ratio = contrast(views[name]!(channels(a.color)), views[name]!(channels(shell)));
        expect(ratio, `${a.name} on ${shell.toString(16)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

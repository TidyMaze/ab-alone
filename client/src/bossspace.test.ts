// The space of each boss fight (#1551): its own light, surround, rim and scatter, from one table keyed by boss id.
import { describe, expect, it } from 'vitest';
import { BOSS_IDS, DECK_PARTICLES } from './deck';
import { BEATS } from './entrance';
import { ACT_SPACE, BOSS_SPACE, MESS_SPACE, actSpaceOf, bossSpaceOf, type Space } from './bossspace';
import { BIOMES } from './roguelite';
import { mixHex } from './daynight';
import doc from '../../docs/specs/art.md?raw';

const bullet = doc.slice(doc.indexOf('- **Palette'), doc.indexOf('- **Materials'));
const allowed = new Set((bullet.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h: string) => h.toLowerCase()));
const hex = (v: number): string => `#${v.toString(16).padStart(6, '0')}`;
const tokens = [...allowed].map((h) => parseInt(h.slice(1), 16));
/** A palette token, or an even mix of two (art.md: only tokens, and mixes of them). */
const fromPalette = (c: number): boolean => allowed.has(hex(c)) || tokens.some((a) => tokens.some((b) => mixHex(a, b, 0.5) === c));

/** The ways two spaces can differ at a glance: the rim, the light's colour, where it comes from, how hard it is, how far the surround takes the key, the scatter. */
function differences(a: Space, b: Space): string[] {
  const out: string[] = [];
  if (a.key !== b.key) out.push('key');
  if (a.sun !== b.sun) out.push('sun');
  if (Math.abs(a.azimuth - b.azimuth) >= 30) out.push('azimuth');
  if (Math.abs(a.intensity - b.intensity) >= 0.15) out.push('intensity');
  if (a.surround !== b.surround || Math.abs(a.ground - b.ground) >= 0.15) out.push('surround');
  if (a.scatter.kind !== b.scatter.kind || a.scatter.color !== b.scatter.color) out.push('scatter');
  return out;
}

describe('the boss spaces (#1551)', () => {
  it('has a space for every boss and no other', () => {
    expect(Object.keys(BOSS_SPACE).sort()).toEqual([...BOSS_IDS].sort());
    expect(BOSS_IDS).toHaveLength(15);
  });

  it('finds the space of a boss id, and none for a mode, a missing or an unknown boss', () => {
    expect(bossSpaceOf('hull')).toBe(BOSS_SPACE.hull);
    expect(bossSpaceOf(null)).toBeNull();
    expect(bossSpaceOf(undefined)).toBeNull();
    expect(bossSpaceOf('nobody')).toBeNull();
  });

  it('paints only with the palette of art.md', () => {
    for (const [id, s] of Object.entries(BOSS_SPACE)) {
      for (const c of [s.key, s.accent, s.sun, s.scatter.color]) expect([id, allowed.has(hex(c))]).toEqual([id, true]);
      expect([id, fromPalette(s.surround)]).toEqual([id, true]); // the surround may be a mix of two tokens
    }
  });

  it('keeps the light where the cells and the marbles read: a sun well off the horizon, in front, not dimmer than 0.6 nor harder than 1.25', () => {
    for (const [id, s] of Object.entries(BOSS_SPACE)) {
      expect([id, s.elevation >= 14 && s.elevation <= 62]).toEqual([id, true]);
      expect([id, Math.abs(s.azimuth) <= 110]).toEqual([id, true]);
      expect([id, s.intensity >= 0.6 && s.intensity <= 1.25]).toEqual([id, true]);
      expect([id, s.ground >= 0 && s.ground <= 0.6 && s.sky >= 0 && s.sky <= 0.5]).toEqual([id, true]);
    }
  });

  it('keeps its scatter within the particle buffer of the scene, and light on the low tier', () => {
    const buffer = Math.max(...Object.values(DECK_PARTICLES).map((p) => p.count));
    for (const [id, s] of Object.entries(BOSS_SPACE)) expect([id, s.scatter.count <= buffer, s.scatter.opacity <= 0.4]).toEqual([id, true, true]);
  });

  it('tells any two bosses apart in at least three ways, so the fifteen read as fifteen places', () => {
    const ids = Object.keys(BOSS_SPACE);
    for (const [i, a] of ids.entries()) {
      for (const b of ids.slice(i + 1)) expect([a, b, differences(BOSS_SPACE[a]!, BOSS_SPACE[b]!).length >= 3]).toEqual([a, b, true]);
    }
  });

  it('never looks like the plain Mess table: each boss differs from it in at least three ways', () => {
    expect(MESS_SPACE.scatter).toEqual(DECK_PARTICLES.mess);
    for (const [id, s] of Object.entries(BOSS_SPACE)) expect([id, differences(s, MESS_SPACE).length >= 3]).toEqual([id, true]);
  });

  it('gives each boss its own entrance beat (#1551): a camera move and a side, no two alike, all four moves used', () => {
    const rows = Object.entries(BOSS_SPACE);
    for (const [id, s] of rows) {
      expect([id, BEATS.includes(s.beat), Math.abs(s.side) >= 45 && Math.abs(s.side) <= 90, s.dark >= 0 && s.dark <= 0.3]).toEqual([id, true, true, true]);
    }
    const keys = rows.map(([, s]) => `${s.beat}/${s.side}`);
    expect(new Set(keys).size).toBe(15);
    expect(new Set(rows.map(([, s]) => s.beat))).toEqual(new Set(BEATS));
    for (const [i, [a, x]] of rows.entries()) {
      for (const [b, y] of rows.slice(i + 1)) expect([a, b, x.beat !== y.beat || x.side !== y.side]).toEqual([a, b, true]);
    }
  });

  it('puts the camera of the beat on the side the light comes from, for the bosses lit from a side', () => {
    for (const [id, s] of Object.entries(BOSS_SPACE)) {
      if (Math.abs(s.azimuth) >= 60) expect([id, Math.sign(s.side)]).toEqual([id, Math.sign(s.azimuth)]);
    }
  });
});

describe('the act spaces of a rogue-lite run (#1551)', () => {
  const rows = Object.entries(ACT_SPACE);

  it('has a space for every biome of the run and no other, found by its id, none for a fight outside a run', () => {
    expect(Object.keys(ACT_SPACE)).toEqual(BIOMES.map((b) => b.id));
    expect(actSpaceOf('forest')).toBe(ACT_SPACE.forest);
    expect(actSpaceOf(null)).toBeNull();
    expect(actSpaceOf('nowhere')).toBeNull();
  });

  it('paints only with the palette of art.md and keeps the light and the surround in the ranges of the boss spaces', () => {
    const buffer = Math.max(...Object.values(DECK_PARTICLES).map((p) => p.count));
    for (const [id, s] of rows) {
      for (const c of [s.key, s.accent, s.sun, s.scatter.color]) expect([id, allowed.has(hex(c))]).toEqual([id, true]);
      expect([id, fromPalette(s.surround)]).toEqual([id, true]);
      expect([id, s.elevation >= 14 && s.elevation <= 62, Math.abs(s.azimuth) <= 110, s.intensity >= 0.6 && s.intensity <= 1.25]).toEqual([id, true, true, true]);
      expect([id, s.ground >= 0 && s.ground <= 0.6 && s.sky >= 0 && s.sky <= 0.5]).toEqual([id, true]);
      expect([id, s.scatter.count <= buffer, s.scatter.opacity <= 0.4]).toEqual([id, true, true]);
    }
  });

  it('tells any two acts apart in at least three ways, and each from the plain Mess table', () => {
    for (const [i, [a, x]] of rows.entries()) {
      expect([a, differences(x, MESS_SPACE).length >= 3]).toEqual([a, true]);
      for (const [b, y] of rows.slice(i + 1)) expect([a, b, differences(x, y).length >= 3]).toEqual([a, b, true]);
    }
  });
});

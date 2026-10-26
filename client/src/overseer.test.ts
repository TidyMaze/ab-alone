import { describe, expect, it } from 'vitest';
import { axialTo3D } from './board';
import { EJECT_MS, FADE_MS, trackAt } from './eject';
import { HAZE_PER_VENT, TAUNTS, TOXIN_TURNS, VENT_NOTE, burnTrack, burnsPlayer, hazeAt, parseBurns, startsBurningPlayer, tauntIndex, toxinText, ventNote } from './overseer';

describe('The Overseer helpers (#635, game-design.md section 7.11)', () => {
  it('splits the [q, r, code] records of removed()', () => {
    expect(parseBurns(Int32Array.from([3, 1, 8, 4, -1, 2]))).toEqual([
      { cell: [3, 1], side: 8 },
      { cell: [4, -1], side: 2 },
    ]);
    expect(parseBurns([])).toEqual([]);
    expect(() => parseBurns([1, 2])).toThrow('multiple of 3');
  });

  it('reads the neurotoxin level and a sarcastic line every 20 %', () => {
    expect(TOXIN_TURNS).toBe(40);
    expect(toxinText(40)).toBe(`Neurotoxin 0 % · 40 turns left · ${TAUNTS[0]}`);
    expect(toxinText(30)).toBe(`Neurotoxin 25 % · 30 turns left · ${TAUNTS[1]}`);
    expect(toxinText(20)).toBe(`Neurotoxin 50 % · 20 turns left · ${TAUNTS[2]}`);
    expect(toxinText(15)).toBe(`Neurotoxin 63 % · 15 turns left · ${TAUNTS[3]}`);
    expect(toxinText(1)).toBe(`Neurotoxin 98 % · 1 turn left · ${TAUNTS[4]}`);
    expect(toxinText(0)).toBe(`Neurotoxin 100 % · 0 turns left · ${TAUNTS[4]}`);
    expect(toxinText(-1)).toBe(''); // a fight with no clock
    expect(new Set(TAUNTS).size).toBe(5);
  });

  it('sinks a burning marble into its vent in place, or fades it with reduced motion', () => {
    const p = axialTo3D(3, 1);
    const track = burnTrack([3, 1], false);
    expect(track).toEqual({ kind: 'tumble', from: { x: p.x, z: p.z }, dir: { x: 0, z: 0 }, durationMs: EJECT_MS });
    const end = trackAt(track, EJECT_MS);
    expect([end.x, end.z, end.drop > 0, end.opacity]).toEqual([p.x, p.z, true, 0]);
    expect(burnTrack([3, 1], true)).toMatchObject({ kind: 'fade', durationMs: FADE_MS });
  });
});

describe('The Overseer speech and vents (#741)', () => {
  it('picks the taunt of the clock: one per 20 %, none without a clock', () => {
    expect(tauntIndex(-1)).toBe(-1);
    expect([40, 33, 32, 20, 8, 7, 0].map(tauntIndex)).toEqual([0, 0, 1, 2, 4, 4, 4]);
    for (const left of [40, 25, 10, 1]) expect(toxinText(left)).toContain(TAUNTS[tauntIndex(left)]!);
  });

  it('burns the boss in P1 and P2 and the player in P2 and P3', () => {
    expect([0, 1, 2].map(burnsPlayer)).toEqual([false, true, true]);
    expect(startsBurningPlayer(0, 1)).toBe(true);
    expect(startsBurningPlayer(1, 2)).toBe(false);
    expect(startsBurningPlayer(0, 0)).toBe(false);
  });

  it('shows the note of the vents for two plies from the change only', () => {
    expect(VENT_NOTE).toBe('The vents now burn your marbles too.');
    expect([-1, 4, 6].map((since) => ventNote(since, 4))).toEqual(['', VENT_NOTE, '']);
    expect(ventNote(4, 5)).toBe(VENT_NOTE);
  });

  it('rises a faint green haze that loops, fades in and out, and holds still with reduced motion', () => {
    expect(HAZE_PER_VENT).toBeGreaterThan(1);
    const start = hazeAt(0, 0, false);
    const mid = hazeAt(1500, 0, false);
    expect(start.opacity).toBe(0);
    expect(mid.y).toBeGreaterThan(start.y);
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(0.6);
    expect(hazeAt(3000, 0, false).y).toBeCloseTo(start.y);
    expect(hazeAt(0, 0.5, false).y).toBeCloseTo(mid.y); // the same cycle, a half turn on
    expect(hazeAt(0, 0, true)).toEqual(hazeAt(9999, 0, true));
    expect(hazeAt(0, 0, true).opacity).toBeGreaterThan(0);
  });
});

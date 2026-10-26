import { describe, expect, it } from 'vitest';
import { axialTo3D } from './board';
import { EJECT_MS, FADE_MS, trackAt } from './eject';
import { TAUNTS, TOXIN_TURNS, burnTrack, parseBurns, toxinText } from './overseer';

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

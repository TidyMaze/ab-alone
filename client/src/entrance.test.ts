import { describe, expect, it } from 'vitest';
import { POLAR_MAX, POLAR_MIN, resetView } from './camera';
import { BEATS, ENTRANCE_MS, Entrance, entranceCard, entranceLight, entranceView, type EntranceSpec } from './entrance';

const final = { azimuth: 0.3, polar: 0.9, distance: 10 };
const spec = (beat: EntranceSpec['beat'], side = 60, dark = 0.1): EntranceSpec => ({ beat, side, dark });

describe('the entrance beat of a boss fight (#1551, motion.md story 9, replaces the lair push-in of #1519)', () => {
  it('lasts about a second and a half', () => {
    expect(ENTRANCE_MS).toBeGreaterThanOrEqual(1300);
    expect(ENTRANCE_MS).toBeLessThanOrEqual(1700);
  });

  it('has four camera moves', () => {
    expect([...BEATS].sort()).toEqual(['drop', 'orbit', 'pull', 'rise']);
  });

  for (const beat of BEATS) {
    it(`${beat}: starts away from the final framing, ends on it, eased and clamped in time`, () => {
      const start = entranceView(final, spec(beat), 0);
      expect(start).not.toEqual(final);
      expect(entranceView(final, spec(beat), -50)).toEqual(start); // before the start: the start pose
      expect(entranceView(final, spec(beat), ENTRANCE_MS)).toBe(final); // the final view itself
      expect(entranceView(final, spec(beat), ENTRANCE_MS * 3)).toBe(final);
      const mid = entranceView(final, spec(beat), ENTRANCE_MS / 2);
      expect(mid).not.toEqual(start);
      expect(mid).not.toEqual(final);
    });
  }

  it('orbit swings from the boss side round to the board, farther and a little higher', () => {
    const start = entranceView(final, spec('orbit', 90), 0);
    expect(start.azimuth).toBeCloseTo(final.azimuth + Math.PI / 2);
    expect(start.distance).toBeGreaterThan(final.distance);
    expect(start.polar).toBeLessThan(final.polar);
    expect(entranceView(final, spec('orbit', -90), 0).azimuth).toBeCloseTo(final.azimuth - Math.PI / 2);
  });

  it('drop comes down from high above, rise up from low, pull out from close', () => {
    expect(entranceView(final, spec('drop'), 0).polar).toBeLessThan(final.polar - 0.4);
    expect(entranceView(final, spec('rise'), 0).polar).toBeGreaterThan(final.polar + 0.3);
    expect(entranceView(final, spec('pull'), 0).distance).toBeLessThan(final.distance * 0.7);
  });

  it('the side turns the start of every move to its own side, none for side 0', () => {
    for (const beat of BEATS) {
      const [left, right, none] = [-60, 60, 0].map((side) => entranceView(final, spec(beat, side), 0).azimuth);
      expect([beat, left! < final.azimuth, right! > final.azimuth]).toEqual([beat, true, true]);
      expect([beat, none]).toEqual([beat, final.azimuth]);
    }
  });

  it('keeps every pose inside the view limits', () => {
    const near = { azimuth: 0, polar: POLAR_MIN, distance: 17 };
    const low = { azimuth: 0, polar: POLAR_MAX, distance: 6 };
    for (const beat of BEATS) {
      for (const v of [near, low, resetView(4)]) {
        for (const ms of [0, 300, 900]) {
          const at = entranceView(v, spec(beat), ms);
          expect([beat, at.distance >= 6 && at.distance <= 18, at.polar >= POLAR_MIN && at.polar <= POLAR_MAX]).toEqual([beat, true, true]);
        }
      }
    }
  });

  it('raises the light from dark to full, monotonically, full before the end', () => {
    const s = spec('orbit', 0, 0.2);
    expect(entranceLight(s, 0)).toBeCloseTo(0.2);
    expect(entranceLight(s, -10)).toBeCloseTo(0.2);
    const at = [0, 200, 400, 600, 800, 1000].map((ms) => entranceLight(s, ms));
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThanOrEqual(at[i - 1]!);
    expect(entranceLight(s, ENTRANCE_MS * 0.9)).toBe(1);
    expect(entranceLight(s, ENTRANCE_MS * 2)).toBe(1);
  });

  it('writes the card from the name of the boss and its deck', () => {
    expect(entranceCard('The Choir', 'furnace')).toEqual({ name: 'The Choir', deck: 'Furnace deck' });
    expect(entranceCard('The Echo', 'mess')).toEqual({ name: 'The Echo', deck: 'Mess deck' });
  });

  it('does not run without a beat (a mode, an unknown boss) nor under reduced motion', () => {
    const beat = new Entrance();
    beat.start(0, null, false);
    expect(beat.active).toBe(false);
    expect(beat.frame(final, 10)).toBeNull();
    expect(beat.light(10)).toBe(1);
    beat.start(0, spec('orbit'), true);
    expect(beat.active).toBe(false);
    expect(beat.frame(final, 10)).toBeNull();
  });

  it('runs frame by frame and ends on its own at the end of the time', () => {
    const beat = new Entrance();
    beat.start(1000, spec('rise'), false);
    expect(beat.active).toBe(true);
    expect(beat.name).toBe('rise');
    beat.step(1000 + ENTRANCE_MS / 2);
    expect(beat.active).toBe(true);
    expect(beat.frame(final, 1000)).toEqual(entranceView(final, spec('rise'), 0));
    expect(beat.light(1000)).toBeCloseTo(0.1);
    beat.step(1000 + ENTRANCE_MS);
    expect(beat.active).toBe(false);
    expect(beat.frame(final, 1000 + ENTRANCE_MS)).toBeNull();
    expect(beat.light(1000 + ENTRANCE_MS)).toBe(1);
    expect(beat.name).toBe('');
  });

  it('a press or a key snaps it at once, and says whether one was running', () => {
    const beat = new Entrance();
    expect(beat.snap()).toBe(false); // nothing running: nothing to draw
    beat.start(0, spec('drop'), false);
    expect(beat.snap()).toBe(true);
    expect(beat.active).toBe(false);
    expect(beat.frame(final, 60)).toBeNull(); // the final framing from now on
    expect(beat.snap()).toBe(false);
  });

  it('follows the view that is current, so a resize during the beat does not jump back', () => {
    const beat = new Entrance();
    beat.start(0, spec('pull'), false);
    const refit = { azimuth: 0, polar: 0.5, distance: 14 };
    expect(beat.frame(refit, ENTRANCE_MS / 2)).toEqual(entranceView(refit, spec('pull'), ENTRANCE_MS / 2));
  });
});

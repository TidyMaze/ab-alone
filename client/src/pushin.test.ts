import { describe, expect, it } from 'vitest';
import { POLAR_MIN, resetView } from './camera';
import { PUSH_FAR, PUSH_HIGH, PUSH_MS, PushIn, pushInView } from './pushin';

const final = { azimuth: 0.3, polar: 0.9, distance: 10 };

describe('the push-in of the boss camera when a lair starts the fight (#1519, motion.md story 9)', () => {
  it('lasts about 350 ms', () => {
    expect(PUSH_MS).toBeGreaterThanOrEqual(300);
    expect(PUSH_MS).toBeLessThanOrEqual(400);
  });

  it('starts farther and higher than the final framing, with the same turn', () => {
    const start = pushInView(final, 0);
    expect(start.distance).toBeCloseTo(final.distance * PUSH_FAR);
    expect(start.polar).toBeCloseTo(final.polar - PUSH_HIGH);
    expect(start.azimuth).toBe(final.azimuth);
  });

  it('eases monotonically from the start pose to the final one, and is clamped in time', () => {
    const at = [0, 50, 100, 200, 300, PUSH_MS - 1].map((ms) => pushInView(final, ms));
    for (let i = 1; i < at.length; i++) {
      expect(at[i]!.distance).toBeLessThanOrEqual(at[i - 1]!.distance);
      expect(at[i]!.polar).toBeGreaterThanOrEqual(at[i - 1]!.polar);
    }
    expect(pushInView(final, -100)).toEqual(pushInView(final, 0)); // before the start: the start pose
    expect(pushInView(final, PUSH_MS)).toBe(final); // at the end: the final view itself
    expect(pushInView(final, PUSH_MS * 3)).toBe(final);
  });

  it('keeps the start pose inside the view limits', () => {
    const near = { azimuth: 0, polar: POLAR_MIN, distance: 17 };
    const start = pushInView(near, 0);
    expect(start.distance).toBeLessThanOrEqual(18);
    expect(start.polar).toBeGreaterThanOrEqual(POLAR_MIN);
    expect(pushInView(resetView(4), 0).polar).toBeGreaterThanOrEqual(POLAR_MIN);
  });

  it('does not run for a fight that is not a lair, nor under reduced motion', () => {
    const push = new PushIn();
    push.start(0, { lair: false, reduced: false });
    expect(push.active).toBe(false);
    expect(push.frame(final, 10)).toBeNull();
    push.start(0, { lair: true, reduced: true });
    expect(push.active).toBe(false);
    expect(push.frame(final, 10)).toBeNull();
  });

  it('runs for a lair, frame by frame, and ends on its own at the end of the time', () => {
    const push = new PushIn();
    push.start(1000, { lair: true, reduced: false });
    expect(push.active).toBe(true);
    expect(push.frame(final, 1000)).toEqual(pushInView(final, 0));
    expect(push.frame(final, 1000 + PUSH_MS / 2)).not.toBeNull();
    expect(push.frame(final, 1000 + PUSH_MS)).toBeNull();
    expect(push.active).toBe(false);
  });

  it('a press or a key snaps it to the final framing at once, and says whether one was running', () => {
    const push = new PushIn();
    expect(push.snap()).toBe(false); // nothing running: nothing to draw
    push.start(0, { lair: true, reduced: false });
    expect(push.frame(final, 50)).not.toBeNull();
    expect(push.snap()).toBe(true);
    expect(push.active).toBe(false);
    expect(push.frame(final, 60)).toBeNull(); // the final framing from now on
  });

  it('follows the view that is current, so a resize during the push-in does not jump back', () => {
    const push = new PushIn();
    push.start(0, { lair: true, reduced: false });
    const refit = { azimuth: 0, polar: 0.5, distance: 14 };
    expect(push.frame(refit, PUSH_MS / 2)).toEqual(pushInView(refit, PUSH_MS / 2));
  });
});

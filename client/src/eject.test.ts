import { describe, expect, it } from 'vitest';
import { axialTo3D, cellIndex, DIRECTIONS } from './board';
import {
  EJECT_MS,
  FADE_MS,
  PUSH_MS,
  VOID_MS,
  ejectTrack,
  findEjection,
  trackAt,
  type EjectPose,
  type EjectTrack,
} from './eject';

const empty = (): number[] => new Array<number>(61).fill(0);
const put = (cells: Array<[number, number, number]>): number[] => {
  const b = empty();
  for (const [q, r, side] of cells) b[cellIndex(q, r)] = side;
  return b;
};

describe('ejectTrack', () => {
  it('pulls the marble along the push direction and lasts under 1.5 s, world.md sections 5 and 7', () => {
    const track = ejectTrack([-2, -2], 4, false); // NW, the (-2,-3) neighbour is off the board
    const from = axialTo3D(-2, -2);
    const step = axialTo3D(...DIRECTIONS[4]!);
    expect(track.kind).toBe('tumble');
    expect(track.durationMs).toBe(EJECT_MS);
    expect(EJECT_MS).toBeLessThan(1500);
    expect(track.from).toEqual({ x: from.x, z: from.z });
    expect(track.dir.x).toBeCloseTo(step.x);
    expect(track.dir.z).toBeCloseTo(step.z);
    expect(Math.hypot(track.dir.x, track.dir.z)).toBeCloseTo(1);
  });

  it('the push over the rim is the inhale, the void after it the 600 ms vacuum silence', () => {
    expect(PUSH_MS).toBeGreaterThan(0);
    expect(VOID_MS).toBe(600);
    expect(EJECT_MS).toBe(PUSH_MS + VOID_MS);
  });

  it('reduced motion: a plain fade, shorter than the full effect (tech.md section 5.1)', () => {
    const track = ejectTrack([-2, -2], 4, true);
    expect(track.kind).toBe('fade');
    expect(track.durationMs).toBe(FADE_MS);
    expect(FADE_MS).toBeGreaterThan(0);
    expect(FADE_MS).toBeLessThan(EJECT_MS);
  });
});

describe('trackAt', () => {
  const track = ejectTrack([0, 0], 0, false); // E, the pull is +x
  const reduced = ejectTrack([0, 0], 0, true);
  const still = { x: 0, z: 0, drop: 0, yaw: trackAt(track, 0).yaw, roll: 0, twist: 0, along: 1, across: 1 };
  const sample = (t: EjectTrack): EjectPose[] =>
    Array.from({ length: t.durationMs / 10 + 1 }, (_, i) => trackAt(t, i * 10));

  it('starts at rest on its cell, round and opaque', () => {
    expect(trackAt(track, 0)).toEqual({ ...still, opacity: 1, done: false });
  });

  it('is still at rest before its start: a frame time can come before the start time', () => {
    expect(trackAt(track, -16)).toEqual(trackAt(track, 0));
  });

  it('turns the stretch axis onto the pull direction', () => {
    for (const dir of [0, 1, 2, 3, 4, 5]) {
      const t = ejectTrack([0, 0], dir, false);
      const p = trackAt(t, 0);
      expect(Math.cos(p.yaw)).toBeCloseTo(t.dir.x);
      expect(-Math.sin(p.yaw)).toBeCloseTo(t.dir.z);
    }
  });

  it('push: rolls over the rim with the line that pushes it, fast then slowing, round and opaque', () => {
    const p = trackAt(track, PUSH_MS / 2);
    expect(p.x).toBeCloseTo(1 - 0.5 ** 3); // a cubic ease out, the pace of a pushed marble
    expect(p.z).toBeCloseTo(0);
    expect(p.roll).toBeCloseTo(p.x / 0.36); // rolls forward without sliding
    expect(p.twist).toBe(0);
    expect(p.along).toBe(1);
    expect(p.drop).toBe(0);
    expect(p.opacity).toBe(1);
  });

  it('clears its cell for the marble pushed in behind it: a marble width out in 70 ms', () => {
    expect(trackAt(track, 70).x).toBeGreaterThan(0.72);
  });

  it('ends the push one cell out, past the rim, still opaque', () => {
    const p = trackAt(track, PUSH_MS);
    expect(p.x).toBeCloseTo(1);
    expect(p.opacity).toBe(1);
    expect(p.along).toBe(1);
  });

  it('then the void takes it: it falls, tumbles, stretches along the pull and fades', () => {
    const p = trackAt(track, PUSH_MS + 300);
    expect(p.x).toBeGreaterThan(1);
    expect(p.drop).toBeGreaterThan(0);
    expect(p.roll).toBeGreaterThan(p.x / 0.36); // spins faster than a roll
    expect(p.twist).not.toBe(0); // and off the roll axis: a tumble
    expect(p.along).toBeGreaterThan(1);
    expect(p.across).toBeLessThan(1);
    expect(p.along * p.across * p.across).toBeCloseTo(1); // the stretch keeps its volume
    expect(p.opacity).toBeGreaterThan(0);
    expect(p.opacity).toBeLessThan(1);
    expect(p.done).toBe(false);
  });

  it('never jumps from the push to the void', () => {
    const [a, b] = [trackAt(track, PUSH_MS - 1), trackAt(track, PUSH_MS + 1)];
    for (const key of ['x', 'z', 'drop', 'roll', 'twist', 'along', 'opacity'] as const) {
      expect(Math.abs(b[key] - a[key])).toBeLessThan(0.01);
    }
  });

  it('ends gone below the board, and stays there', () => {
    const end = trackAt(track, EJECT_MS);
    expect(end.opacity).toBe(0);
    expect(end.done).toBe(true);
    expect(end.drop).toBeGreaterThan(0.72); // the whole marble is under the board top
    expect(trackAt(track, 5000)).toEqual(end);
  });

  it('a skip jumps to the end at once', () => {
    expect(trackAt(track, 100, true)).toEqual(trackAt(track, EJECT_MS));
    expect(trackAt(reduced, 100, true)).toEqual(trackAt(reduced, FADE_MS));
    expect(trackAt(track, 100, false).done).toBe(false);
  });

  it('reduced motion: fades one cell out, where the push left it, no travel, no fall, no tumble, no stretch', () => {
    const out = { ...still, x: 1 }; // not on its cell, where the marble pushed in behind it now sits
    expect(trackAt(reduced, 0)).toEqual({ ...out, opacity: 1, done: false });
    expect(trackAt(reduced, FADE_MS / 2)).toEqual({ ...out, opacity: 0.5, done: false });
    expect(trackAt(reduced, FADE_MS)).toEqual({ ...out, opacity: 0, done: true });
    for (const { opacity: _o, done: _d, ...rest } of sample(reduced)) expect(rest).toEqual(out);
  });

  it('no flash, world.md section 8: the opacity only ever falls, once, from 1 to 0', () => {
    for (const t of [track, reduced]) {
      const opacities = sample(t).map((p) => p.opacity);
      expect(opacities[0]).toBe(1);
      expect(opacities.at(-1)).toBe(0);
      opacities.slice(1).forEach((o, i) => expect(o).toBeLessThanOrEqual(opacities[i]!));
    }
  });
});

describe('findEjection', () => {
  // Black trio on the q = -2 column pushes two White marbles NW: the last one leaves the board.
  const move = { cells: [[-2, 0], [-2, 1], [-2, 2]] as [number, number][], dir: 4 };
  const before = put([[-2, 0, 1], [-2, 1, 1], [-2, 2, 1], [-2, -1, 2], [-2, -2, 2]]);
  const after = put([[-2, -1, 1], [-2, 0, 1], [-2, 1, 1], [-2, -2, 2]]);

  it('returns the cell and side of the marble that left the board', () => {
    expect(findEjection(before, after, move)).toEqual({ cell: [-2, -2], side: 2 });
  });

  it('is null when no marble was lost', () => {
    expect(findEjection(before, before, move)).toBeNull();
  });

  it('counts marbles only: a vanished cell and the marble it took are no push ejection, The Hull', () => {
    const step = { cells: [[0, 2]] as [number, number][], dir: 4 };
    expect(findEjection(put([[0, 2, 1]]), put([[0, 1, 1], [4, -1, 3]]), step)).toBeNull();
    expect(findEjection(put([[0, 2, 1], [4, -1, 2]]), put([[0, 1, 1], [4, -1, 3]]), step)).toBeNull();
  });

  it('is null when a marble was lost but the move pushed none off: a flip paid with a boss marble, The Chaplain, #299', () => {
    // A White trio steps NE into an empty cell, and a White marble far from it is lost to the void.
    const step = { cells: [[-2, 3], [-1, 2], [0, 1]] as [number, number][], dir: 2 };
    const b = put([[-2, 3, 2], [-1, 2, 2], [0, 1, 2], [-3, 0, 2]]);
    const a = put([[-1, 2, 2], [0, 1, 2], [1, 0, 2]]);
    expect(findEjection(b, a, step)).toBeNull(); // the rim cell of the line, (4,-3), is empty
    const rim = put([[-2, 3, 2], [-1, 2, 2], [0, 1, 2], [-3, 0, 2], [4, -3, 1]]);
    const kept = put([[-1, 2, 2], [0, 1, 2], [1, 0, 2], [4, -3, 1]]);
    expect(findEjection(rim, kept, step)).toBeNull(); // the Black marble on the rim stays
  });

  it('ejects at the edge of a hole: a push onto a vanished cell, The Hull', () => {
    const push = { cells: [[-1, 0], [0, 0]] as [number, number][], dir: 0 }; // E, (2,0) is gone
    const b = put([[-1, 0, 1], [0, 0, 1], [1, 0, 2], [2, 0, 3]]);
    const a = put([[0, 0, 1], [1, 0, 1], [2, 0, 3]]);
    expect(findEjection(b, a, push)).toEqual({ cell: [1, 0], side: 2 });
  });
});

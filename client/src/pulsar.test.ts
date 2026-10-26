import { describe, expect, it } from 'vitest';
import { CELLS, axialTo3D, cellIndex, type Axial } from './board';
import { contrastRatio, type RGB } from './contrast';
import {
  CHARGE_TURNS,
  FLASH_MS,
  PULSAR_BOUNDS,
  PULSAR_DISTANCE,
  PULSAR_PARTS,
  PULSE_COUNTER_SIZE,
  SHOCK_MS,
  SHOCK_RADIUS,
  charging,
  chevronSpots,
  counterSpot,
  fallen,
  parsePulsar,
  parsePulse,
  pulseMove,
  pulseText,
  pulsarSpot,
  shockAt, RIPPLES, RIPPLE_MS, SHOCK_COLOR, rippleAt, rippling } from './pulsar';
import { slideTracks } from './slide';

const NW = 4;
const E = 0;
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** A 61-cell board with `black` and `white` marbles. */
function board(black: Axial[], white: Axial[]): number[] {
  const out = CELLS.map(() => 0);
  for (const c of black) out[cellIndex(...c)] = 1;
  for (const c of white) out[cellIndex(...c)] = 2;
  return out;
}

describe('parsePulsar and pulseText', () => {
  it('read the next pulse of the bridge, none for the other bosses', () => {
    expect(parsePulsar([])).toBeNull();
    expect(parsePulsar([4, 2, 3])).toEqual({ id: NW, left: 2, force: 3 });
    expect(pulseText(null)).toBe('');
    expect(pulseText(parsePulsar([4, 2, 2]))).toBe('Pulse in 2 turns, force 2');
    expect(pulseText(parsePulsar([4, 1, 3]))).toBe('Pulse in 1 turn, force 3');
    expect(pulseText(parsePulsar([4, 4, 0]))).toBe('Pulse in 4 turns, force ∞'); // P3: infinite
  });

  it('charges 2 turns ahead of a pulse, never at rest', () => {
    expect(CHARGE_TURNS).toBe(2);
    expect([1, 2, 3, 4].map((left) => charging({ id: NW, left, force: 2 }))).toEqual([true, true, false, false]);
  });
});

describe('parsePulse', () => {
  it('splits the pulsar, the 61 cells before the pulse and the cells it moved', () => {
    expect(parsePulse([])).toBeNull();
    const before = board([[1, 3]], [[4, -4]]);
    const p = parsePulse([NW, ...before, 1, 3, 4, -4])!;
    expect(p.id).toBe(NW);
    expect(p.board).toEqual(before);
    expect(p.moved).toEqual([
      [1, 3],
      [4, -4],
    ]);
  });
});

describe('the pulse as slides and falls', () => {
  // The first pulse of the fixture (seed 2, pulsar NW): the lone (1, 3) goes up a cell, (4, -4) goes off the top.
  const before = board([[1, 3], [-4, 4], [-4, 3]], [[4, -4]]);
  const pulse = { id: NW, board: before, moved: [[1, 3], [4, -4]] as Axial[] };
  const after = board([[1, 2], [-4, 4], [-4, 3]], []);

  it('slides every pushed marble a cell, leaving the ones that fall to the ejection', () => {
    const tracks = slideTracks(pulse.board, after, pulseMove(pulse), false);
    expect(tracks.map((t) => t.cell)).toEqual([[1, 2]]);
    expect(tracks[0]!.from).toEqual({ x: axialTo3D(1, 3).x, z: axialTo3D(1, 3).z });
    expect(slideTracks(pulse.board, after, pulseMove(pulse), true)[0]!.durationMs).toBe(0); // reduced: a jump
  });

  it('lists the marbles pushed past the rim with their side', () => {
    expect(fallen(pulse)).toEqual([{ cell: [4, -4], side: 2 }]);
    expect(fallen({ ...pulse, moved: [[1, 3]] })).toEqual([]);
  });
});

describe('pulsarSpot and chevronSpots', () => {
  it('stands each pulsar off the corner opposite the way it pushes, pointing that way', () => {
    const nw = pulsarSpot(NW); // pushes NW (0, -1): off the bottom corner (0, 4)
    const corner = axialTo3D(0, 4);
    expect(nw.x).toBeCloseTo((corner.x * PULSAR_DISTANCE) / 4);
    expect(nw.z).toBeCloseTo((corner.z * PULSAR_DISTANCE) / 4);
    expect(Math.hypot(nw.x, nw.z)).toBeGreaterThan(Math.hypot(corner.x, corner.z) + 1); // clear of the rim
    const e = pulsarSpot(E); // pushes E: off the W corner (-4, 0)
    expect(e.x).toBeCloseTo(-PULSAR_DISTANCE);
    expect(e.yaw).toBeCloseTo(0);
    const spots = new Set([0, 1, 2, 3, 4, 5].map((id) => pulsarSpot(id)).map(({ x, z }) => `${x.toFixed(2)},${z.toFixed(2)}`));
    expect(spots.size).toBe(6);
  });

  it('stands the counter of a charging pulsar above its core, #691', () => {
    expect(counterSpot(NW)).toEqual({ x: pulsarSpot(NW).x, y: 1.35, z: pulsarSpot(NW).z });
    expect(PULSE_COUNTER_SIZE).toBe(0.5);
  });

  it('bounds the six pulsars, their beam tips and the counter above each, for the camera fit, #691', () => {
    expect(PULSAR_BOUNDS).toHaveLength(6 * 23);
    const xs = PULSAR_BOUNDS.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(pulsarSpot(E).x - 0.85); // the outer beam tip of the pulsar off the W corner
    expect(Math.max(...PULSAR_BOUNDS.map((p) => p.y))).toBeCloseTo(1.35 + PULSE_COUNTER_SIZE / 2); // a counter's top
    expect(Math.min(...PULSAR_BOUNDS.map((p) => p.y))).toBe(0); // a base's foot
    const nw = pulsarSpot(NW);
    const reach = Math.max(...PULSAR_BOUNDS.map((p) => Math.hypot(p.x - nw.x, p.z - nw.z)).filter((d) => d < 1));
    expect(reach).toBeCloseTo(0.85); // its beam tips, the farthest points of a pulsar
  });

  it('puts a chevron one cell out before the pulsar end of each of its 9 lines', () => {
    const spots = chevronSpots(E);
    expect(spots).toHaveLength(9);
    const ends = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((r): Axial => [Math.max(-4, -4 - r) - 1, r]);
    for (const [q, r] of ends) {
      const { x, z } = axialTo3D(q, r);
      expect(spots.some((s) => Math.abs(s.x - x) < 1e-9 && Math.abs(s.z - z) < 1e-9)).toBe(true);
    }
    expect(spots.every((s) => s.yaw === spots[0]!.yaw)).toBe(true);
    expect(chevronSpots(NW)).toHaveLength(9);
  });
});

describe('shockAt', () => {
  it('grows a ring from the pulsar past the far corner, fading out', () => {
    const start = shockAt(NW, 0, false);
    expect(start).toMatchObject({ radius: 0, done: false });
    expect([start.x, start.z]).toEqual([pulsarSpot(NW).x, pulsarSpot(NW).z]);
    const mid = shockAt(NW, SHOCK_MS / 2, false);
    expect(mid.radius).toBeGreaterThan(SHOCK_RADIUS / 2); // ease out
    expect(mid.opacity).toBeLessThan(start.opacity);
    expect(shockAt(NW, SHOCK_MS, false)).toMatchObject({ radius: SHOCK_RADIUS, opacity: 0, done: true });
    expect(shockAt(NW, -5, false).radius).toBe(0);
    expect(SHOCK_RADIUS).toBeGreaterThan(PULSAR_DISTANCE + 4); // across the board
  });

  it('under reduced motion shows the full ring at once and fades it, no growth', () => {
    expect(shockAt(NW, 0, true).radius).toBe(SHOCK_RADIUS);
    expect(shockAt(NW, FLASH_MS / 2, true).radius).toBe(SHOCK_RADIUS);
    expect(shockAt(NW, FLASH_MS, true).done).toBe(true);
  });
});

describe('PULSAR_PARTS', () => {
  it('is a base, a core and two beam cones along the push axis', () => {
    expect(PULSAR_PARTS.map((p) => p.type)).toEqual(['base', 'core', 'cone', 'cone']);
    const cones = PULSAR_PARTS.filter((p) => p.type === 'cone');
    expect(cones.map((c) => Math.sign(c.position[0]))).toEqual([1, -1]);
    expect(cones.map((c) => Boolean(c.flip))).toEqual([false, true]);
    expect(cones.every((c) => c.position[2] === 0)).toBe(true);
    expect(new Set(PULSAR_PARTS.map((p) => p.id)).size).toBe(4);
  });

  it('reads its pale core 3:1 against its steel base and the near-black deck', () => {
    const [base, core] = PULSAR_PARTS;
    expect(contrastRatio(rgb(core!.color), rgb(base!.color))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(rgb(core!.color), rgb(0x0b0d0f))).toBeGreaterThanOrEqual(3);
  });
});

describe('the ripples of a pulsar that fires next turn (#741)', () => {
  it('ripple only with 1 turn left', () => {
    expect([0, 1, 2, 3].map((left) => rippling({ id: NW, left, force: 2 }))).toEqual([false, true, false, false]);
  });

  it('are rings like the shockwave, much smaller and dimmer, that grow and fade in a loop', () => {
    expect(RIPPLES).toBe(2);
    expect(SHOCK_COLOR).toBeGreaterThan(0);
    const start = rippleAt(0, 0, false);
    const mid = rippleAt(RIPPLE_MS / 2, 0, false);
    expect(mid.radius).toBeGreaterThan(start.radius);
    expect(mid.opacity).toBeLessThan(start.opacity);
    expect(rippleAt(RIPPLE_MS, 0, false).radius).toBeCloseTo(start.radius);
    expect(rippleAt(0, 1, false).radius).toBeCloseTo(mid.radius); // the second ring is half a cycle on
    for (const k of [0, 1]) for (const t of [0, 400, 1100]) {
      const at = rippleAt(t, k, false);
      expect(at.radius).toBeLessThan(SHOCK_RADIUS / 3);
      expect(at.opacity).toBeLessThan(0.3);
    }
  });

  it('is one static faint ring with reduced motion', () => {
    expect(rippleAt(0, 0, true)).toEqual(rippleAt(777, 0, true));
    expect(rippleAt(0, 0, true).opacity).toBeGreaterThan(0);
    expect(rippleAt(0, 1, true).opacity).toBe(0); // the second ring is not drawn
  });
});

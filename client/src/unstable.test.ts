import { describe, expect, it } from 'vitest';
import { VANISHED, cellIndex } from './board';
import {
  BURST_MS,
  ENERGY,
  FLASH_MS,
  SWEEP_MS,
  burstAt,
  coreText,
  energyGlow,
  fallen,
  lostCells,
  parseCharges,
  parseCore,
  parseEvents,
  pipOffsets,
  shoveDir,
  shoveTracks,
  sweepAt,
  wedgeCorners,
  wedgeGlow,
  type UnstableEvents,
} from './unstable';

// The Unstable Core's pure helpers (#751, game-design.md section 7.13).

const board = (marbles: [number, number, number][], gone: [number, number][] = []): number[] => {
  const cells = Array.from({ length: 61 }, () => 0);
  for (const [q, r, side] of marbles) cells[cellIndex(q, r)] = side;
  for (const [q, r] of gone) cells[cellIndex(q, r)] = VANISHED;
  return cells;
};

const events = (over: Partial<UnstableEvents>): UnstableEvents => ({ board: board([]), overloaded: [], collapsed: false, wedge: -1, shoves: [], ...over });

describe('the bridge records', () => {
  it('reads the charges as cells with a count', () => {
    expect(parseCharges([])).toEqual([]);
    expect(parseCharges([0, 1, 2, 3, -1, 1])).toEqual([{ cell: [0, 1], n: 2 }, { cell: [3, -1], n: 1 }]);
  });

  it('reads the next events, nothing for the other bosses', () => {
    expect(parseCore([])).toBeNull();
    expect(parseCore([1, 0, -1, -1])).toEqual({ core: true, collapsing: false, wedge: -1, shockIn: -1 });
    expect(parseCore([0, 1, 4, 1])).toEqual({ core: false, collapsing: true, wedge: 4, shockIn: 1 });
  });

  it('reads the events of the last ply', () => {
    expect(parseEvents([])).toBeNull();
    const codes = board([[0, 0, 1]]);
    const flat = [1, 1, 2, 2, ...codes.slice(0, 61), 0, 0, 3, 0, 4, 0, 5, 0, 1, 1, 0, 0, 0, 0];
    expect(parseEvents(flat)).toEqual({
      board: codes.slice(0, 61),
      overloaded: [[0, 0]],
      collapsed: true,
      wedge: 2,
      shoves: [{ from: [3, 0], to: [4, 0] }, { from: [5, 0], to: [1, 1] }],
    });
  });
});

describe('the HUD line', () => {
  it('says nothing outside this fight', () => {
    expect(coreText(null)).toBe('');
  });

  it('gives the rule while the core stands, then the collapse, the wedge and the turns to the shockwave', () => {
    const core = { core: true, collapsing: false, wedge: -1, shockIn: -1 };
    expect(coreText(core)).toBe('Charged marbles weigh more · 4 charges blow a marble off');
    expect(coreText({ ...core, collapsing: true })).toBe('The core collapses after your move');
    expect(coreText({ ...core, core: false })).toBe('');
    expect(coreText({ ...core, core: false, shockIn: 3 })).toBe('Shockwave in 3 turns');
    expect(coreText({ ...core, core: false, shockIn: 1 })).toBe('Shockwave in 1 turn');
    expect(coreText({ ...core, core: false, shockIn: 1, wedge: 4 })).toBe('Shockwave after your move: the glowing wedge');
  });
});

describe('the drawing helpers', () => {
  it('lays 1 to 3 pips in a centred row', () => {
    expect(pipOffsets(1)).toEqual([0]);
    expect(pipOffsets(3).map((x) => +x.toFixed(2))).toEqual([-0.2, 0, 0.2]);
  });

  it('cuts a wedge as a triangle from the centre to two corners', () => {
    const [apex, a, b] = wedgeCorners(0);
    expect(apex).toEqual({ x: 0, z: 0 });
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(Math.hypot(b.x, b.z));
    expect(a).not.toEqual(b);
    expect(wedgeCorners(5)[2]).toEqual(wedgeCorners(0)[1]); // the sixth wedge ends on the first corner
  });

  it('gives the direction of a shove', () => {
    expect(shoveDir({ from: [3, 0], to: [4, 0] })).toBe(0);
    expect(shoveDir({ from: [0, 0], to: [0, 1] })).toBe(5);
  });

  it('slides the shoved marbles that stay on the board and drops the ones past the rim', () => {
    const e = events({
      board: board([[3, 0, 2], [4, 0, 1]]),
      wedge: 0,
      shoves: [{ from: [4, 0], to: [5, 0] }, { from: [3, 0], to: [4, 0] }],
    });
    expect(shoveTracks(e, false)).toEqual([{ cell: [4, 0], from: expect.any(Object), to: expect.any(Object), durationMs: 200, dir: 0 }]);
    expect(shoveTracks(e, true)[0]!.durationMs).toBe(0);
    expect(fallen(e)).toEqual([{ cell: [4, 0], side: 1, dir: 0 }]);
  });

  it('bursts where a marble overloaded and where one fell with the core', () => {
    expect(lostCells(events({ overloaded: [[2, 0]] }))).toEqual([[2, 0]]);
    const e = events({ board: board([[0, 0, 1], [1, 0, 2], [3, 0, 1]]), overloaded: [[1, 0]], collapsed: true });
    expect(lostCells(e)).toEqual([[1, 0], [0, 0]]);
  });

  it('grows the burst and fades it, or shows it whole under reduced motion', () => {
    const [start, mid, end] = [burstAt(0, false), burstAt(BURST_MS / 2, false), burstAt(BURST_MS, false)];
    expect(start.radius).toBeLessThan(mid.radius);
    expect(mid.radius).toBeLessThan(end.radius);
    expect([start.done, end.done, end.opacity]).toEqual([false, true, 0]);
    expect(burstAt(0, true).radius).toBe(burstAt(FLASH_MS, true).radius);
    expect(burstAt(FLASH_MS, true).done).toBe(true);
    expect(burstAt(-5, false).radius).toBe(start.radius);
  });

  it('sweeps the wedge outward from the centre, or flashes it whole under reduced motion', () => {
    expect(sweepAt(0, false).scale).toBeLessThan(0.1);
    expect(sweepAt(SWEEP_MS / 2, false).scale).toBeGreaterThan(0.5);
    expect(sweepAt(SWEEP_MS, false)).toEqual({ scale: 1, opacity: 0, done: true });
    expect(sweepAt(0, true).scale).toBe(1);
    expect(sweepAt(FLASH_MS, true).done).toBe(true);
  });

  it('pulses the energy cells, flickers them before the collapse and holds them steady under reduced motion', () => {
    expect(energyGlow(0, false, false)).not.toBe(energyGlow(1, false, false));
    expect(new Set([0, 0.13, 0.26].map((s) => energyGlow(s, true, false))).size).toBe(2);
    expect(energyGlow(0, false, true)).toBe(energyGlow(9, false, true));
    expect(energyGlow(0, true, true)).toBeLessThan(energyGlow(0, false, true));
    expect(wedgeGlow(0, true)).toBe(wedgeGlow(5, true));
    expect(wedgeGlow(0, false)).not.toBe(wedgeGlow(0.2, false));
  });

  it('has 7 energy cells', () => {
    expect(ENERGY).toHaveLength(7);
  });
});

import { describe, expect, test } from 'vitest';
import { bossIds, worldRules } from './engine';
import type { Result, ToolError } from './game';
import { OpenWorld, type WorldRules } from './world';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.error)}`);
  return result.value;
}

function failure(result: Result<unknown>): ToolError {
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
  return result.error;
}

/** The real rules of the engine, with the lairs of the world put at `lairs` (q, r pairs) when given. */
function world(lairs?: number[]): OpenWorld {
  const rules: WorldRules = lairs ? { ...worldRules(), world_lairs: () => Int32Array.from(lairs) } : worldRules();
  return new OpenWorld(rules, bossIds);
}

const chunks = new Map<string, Uint8Array>();

/** The terrain code of the engine at a cell of seed `seed`, `-1` off the world. Chunks are read once. */
function code(seed: number, q: number, r: number): number {
  const cx = Math.floor(q / 16);
  const cy = Math.floor(r / 16);
  const key = `${seed},${cx},${cy}`;
  if (!chunks.has(key)) chunks.set(key, worldRules().world_chunk(seed, cx, cy));
  const cells = chunks.get(key)!;
  return cells.length === 0 ? -1 : cells[((r - cy * 16) * 16 + (q - cx * 16)) * 3 + 1]!;
}

const SEEDS = Array.from({ length: 12 }, (_, seed) => seed);

const STEPS: Record<string, [number, number]> = { E: [1, 0], W: [-1, 0], NE: [1, -1], SW: [-1, 1], NW: [0, -1], SE: [0, 1] };

/** An open cell and a direction towards a cell of a terrain in `codes`, near the spawn of the world `seed`, found by the engine's own cells. */
function beside(
  seed: number,
  codes: number[],
  keep: (q: number, r: number) => boolean = () => true,
): { at: [number, number]; dir: string } | null {
  for (let r = -20; r <= 20; r++) {
    for (let q = -20; q <= 20; q++) {
      if (![1, 2, 3].includes(code(seed, q, r))) continue;
      for (const [dir, [dq, dr]] of Object.entries(STEPS)) {
        if (codes.includes(code(seed, q + dq, r + dr)) && keep(q + dq, r + dr)) return { at: [q, r], dir };
      }
    }
  }
  return null;
}

describe('before a world is started', () => {
  test('every tool says there is no world', () => {
    const open = world();
    for (const result of [open.state({}), open.step({ direction: 'E' }), open.walk({ q: 1, r: 0 })]) {
      expect(failure(result).code).toBe('no_world');
    }
  });
});

describe('a new world', () => {
  test('puts the hero on the spawn with the troop round it, and lists the lairs', () => {
    const open = world();
    const state = value(open.newWorld({ seed: 0 }));
    expect(state.seed).toBe(0);
    expect(state.hero).toBe('(0,0)');
    expect(state.troop).toEqual(['(1,0)', '(-1,0)', '(1,-1)', '(-1,1)', '(0,-1)', '(0,1)']);
    expect(state.broken).toBe(0);
    expect(state.lairs).toHaveLength(15);
    expect(state.lairs[0]).toEqual({ boss: bossIds()[0], cell: '(373,51)', distance: 424 });
  });

  test('the seed defaults to 0 and the same seed gives the same world', () => {
    const open = world();
    expect(value(open.newWorld({}))).toEqual(value(open.newWorld({ seed: 0 })));
    expect(value(open.newWorld({ seed: 7 })).lairs).not.toEqual(value(open.newWorld({ seed: 0 })).lairs);
  });

  test('the window is a hex of cells round the hero, one row per r', () => {
    const state = value(world().newWorld({ seed: 0 }));
    expect(state.window.radius).toBe(3);
    expect(state.window.rows.map((row) => [row.r, row.q0, row.cells.length])).toEqual([
      [-3, 0, 4],
      [-2, -1, 5],
      [-1, -2, 6],
      [0, -3, 7],
      [1, -3, 6],
      [2, -3, 5],
      [3, -3, 4],
    ]);
    const middle = state.window.rows[3]!.cells;
    expect(middle[3]).toBe('H');
    expect(middle[2]).toBe('T');
    expect(middle[4]).toBe('T');
    expect(middle[0]).toBe('g');
  });

  test('a larger radius widens the window', () => {
    const open = world();
    value(open.newWorld({ seed: 0 }));
    expect(value(open.state({ radius: 8 })).window.rows).toHaveLength(17);
  });

  test('a cell off the world is a question mark', () => {
    const rules: WorldRules = { ...worldRules(), world_chunk: (seed, cx, cy) => (cx < 0 ? new Uint8Array() : worldRules().world_chunk(seed, cx, cy)) };
    const open = new OpenWorld(rules, bossIds);
    const rows = value(open.newWorld({ seed: 0 })).window.rows;
    expect(rows[3]!.cells).toBe('??TH' + 'Tgg');
  });
});

describe('a step', () => {
  test('rolls the hero onto the open cell, the troop trails it', () => {
    const open = world();
    value(open.newWorld({ seed: 0 }));
    const moved = value(open.step({ direction: 'E' }));
    expect(moved.moved).toBe(true);
    expect(moved.push).toBeNull();
    expect(moved.state.hero).toBe('(1,0)');
    expect(moved.state.beaten).toBe(0);
    expect(moved.state.troop).toEqual(['(0,0)', '(-1,0)', '(1,-1)', '(-1,1)', '(0,-1)', '(0,1)']);
    expect(value(open.state({})).hero).toBe('(1,0)');
  });

  test('a cell the hero cannot enter refuses the step and changes nothing', () => {
    const found = SEEDS.map((seed) => ({ seed, spot: beside(seed, [0, 4, 7]) })).find((s) => s.spot);
    expect(found).toBeTruthy();
    const open = world();
    value(open.newWorld({ seed: found!.seed }));
    const [q, r] = found!.spot!.at;
    if (q !== 0 || r !== 0) value(open.walk({ q, r }));
    const before = value(open.state({}));
    const error = failure(open.step({ direction: found!.spot!.dir as 'E' }));
    expect(error.code).toBe('blocked');
    expect(value(open.state({}))).toEqual(before);
  });

  test('a boulder is broken by rolling into it and the cell is rock after', () => {
    const found = SEEDS.map((seed) => ({ seed, spot: beside(seed, [5]) })).find((s) => s.spot);
    expect(found).toBeTruthy();
    const open = world();
    value(open.newWorld({ seed: found!.seed }));
    const [q, r] = found!.spot!.at;
    if (q !== 0 || r !== 0) value(open.walk({ q, r }));
    const broken = value(open.state({})).broken;
    const moved = value(open.step({ direction: found!.spot!.dir as 'E' }));
    expect(moved.smashed).toBe('boulder');
    expect(moved.state.broken).toBe(broken + 1);
    const [dq, dr] = STEPS[found!.spot!.dir]!;
    expect(moved.state.hero).toBe(`(${q + dq},${r + dr})`);
    const here = value(open.state({ radius: 1 })).window.rows.find((row) => row.r === r + dr)!;
    expect(here.cells).toContain('H');
    expect(value(open.step({ direction: found!.spot!.dir as 'E' })).smashed).toBeNull();
  });

  test('a tree with no tree beside it is broken, the cell is grass after', () => {
    const lone = (seed: number) => (q: number, r: number) => Object.values(STEPS).every(([dq, dr]) => code(seed, q + dq, r + dr) !== 6);
    const found = SEEDS.map((seed) => ({ seed, spot: beside(seed, [6], lone(seed)) })).find((s) => s.spot);
    expect(found).toBeTruthy();
    const open = world();
    value(open.newWorld({ seed: found!.seed }));
    const [q, r] = found!.spot!.at;
    if (q !== 0 || r !== 0) value(open.walk({ q, r }));
    const broken = value(open.state({})).broken;
    const moved = value(open.step({ direction: found!.spot!.dir as 'E' }));
    expect(moved.smashed).toBe('tree');
    expect(moved.state.broken).toBe(broken + 1);
    const [dq, dr] = STEPS[found!.spot!.dir]!;
    // Walk 8 cells away, along the first line that is open, so the troop has left the cell: it shows as grass.
    const away = Object.values(STEPS).map(([sq, sr]) => open.walk({ q: q + dq + 8 * sq, r: r + dr + 8 * sr })).find((walk) => walk.ok);
    expect(away).toBeTruthy();
    const left = value(open.state({ radius: 8 })).window.rows.find((row) => row.r === r + dr)!;
    expect(left.cells[q + dq - left.q0]).toBe('g');
  });

  test('a tree next to another tree stays in the way', () => {
    const crowded = (seed: number) => (q: number, r: number) => Object.values(STEPS).some(([dq, dr]) => code(seed, q + dq, r + dr) === 6);
    const found = SEEDS.map((seed) => ({ seed, spot: beside(seed, [6], crowded(seed)) })).find((s) => s.spot);
    expect(found).toBeTruthy();
    const open = world();
    value(open.newWorld({ seed: found!.seed }));
    const [q, r] = found!.spot!.at;
    if (q !== 0 || r !== 0) value(open.walk({ q, r }));
    expect(failure(open.step({ direction: found!.spot!.dir as 'E' })).code).toBe('blocked');
  });

  test('a cell off the world refuses the step', () => {
    const rules: WorldRules = { ...worldRules(), world_path: () => new Int32Array() };
    const open = new OpenWorld({ ...rules, world_chunk: () => new Uint8Array() }, bossIds);
    value(open.newWorld({ seed: 0 }));
    const error = failure(open.step({ direction: 'W' }));
    expect(error.message).toContain('off the world');
  });

  test('onto a lair does not move: the state names the boss to fight and how to start it', () => {
    const open = world([3, 0, 0, 9, 0, -9]);
    value(open.newWorld({ seed: 0 }));
    value(open.walk({ q: 2, r: 0 }));
    const entered = value(open.step({ direction: 'E' }));
    expect(entered.moved).toBe(false);
    expect(entered.push).toBeNull();
    expect(entered.lair).toEqual({ index: 0, boss: bossIds()[0], start: `new_game {"boss":"${bossIds()[0]}"}` });
    expect(entered.state.hero).toBe('(2,0)');
    expect(value(open.step({ direction: 'W' })).lair).toBeUndefined();
  });

  test('a lair past the roster is the boss of its number round the roster, as in the client', () => {
    const far = Array.from({ length: bossIds().length }, (_, k) => [100 + k, -200]).flat();
    const open = world([...far, 1, 0]);
    value(open.newWorld({ seed: 0 }));
    expect(value(open.step({ direction: 'E' })).lair).toMatchObject({ index: bossIds().length, boss: bossIds()[0] });
  });
});

describe('a walk', () => {
  test('goes to a far cell by the engine path, the troop is the last cells of it', () => {
    const open = world();
    value(open.newWorld({ seed: 0 }));
    const walked = value(open.walk({ q: 4, r: 0 }));
    expect(walked.steps).toBe(4);
    expect(walked.state.hero).toBe('(4,0)');
    expect(walked.state.troop).toEqual(['(3,0)', '(2,0)', '(1,0)', '(0,0)', '(-1,0)', '(1,-1)']);
  });

  test('walks over a boulder it breaks on the way', () => {
    const found = SEEDS.map((seed) => ({ seed, spot: beside(seed, [5]) })).find((s) => s.spot);
    expect(found).toBeTruthy();
    const open = world();
    value(open.newWorld({ seed: found!.seed }));
    const [q, r] = found!.spot!.at;
    const [dq, dr] = STEPS[found!.spot!.dir]!;
    const walked = value(open.walk({ q: q + dq, r: r + dr }));
    expect(walked.state.hero).toBe(`(${q + dq},${r + dr})`);
    expect(walked.state.broken).toBeGreaterThanOrEqual(1);
  });

  test('stays when the cell is the hero, a lair, an enemy, off the world or too far', () => {
    const open = world([3, 0, 0, 9, 0, -9]);
    value(open.newWorld({ seed: 1 }));
    for (const [q, r] of [[0, 0], [3, 0], [6, 6], [-5000, 0], [100, 0]]) {
      expect(failure(open.walk({ q: q!, r: r! })).code).toBe('no_path');
    }
    expect(value(open.state({})).hero).toBe('(0,0)');
  });
});

// Seed 1 has an enemy group at (6,6), (7,5), (8,4). The values below are what the client gives for the same seed and moves:
// `Hero.step` (client/src/openworld.ts) then `FightState.troopPush` (client/src/openworldfight.ts), as `OpenWorldMode.roll` calls them.
describe('the same seed and moves as the client', () => {
  const PUSHED = { hero: '(6,6)', troop: ['(5,6)', '(4,6)', '(2,6)', '(1,6)', '(0,6)', '(0,5)'] };

  test('six steps SE then five E: the fifth E brings the troop beside the group and it pushes it east', () => {
    const open = world();
    value(open.newWorld({ seed: 1 }));
    for (let i = 0; i < 6; i++) value(open.step({ direction: 'SE' }));
    for (let i = 0; i < 3; i++) expect(value(open.step({ direction: 'E' })).push).toBeNull();
    const near = value(open.step({ direction: 'E' }));
    expect(near.state.hero).toBe('(4,6)');
    expect(near.state.troop).toEqual(['(3,6)', '(2,6)', '(1,6)', '(0,6)', '(0,5)', '(0,4)']);
    expect(near.state.enemies).toEqual(['(6,6)', '(7,5)']);
    const pushed = value(open.step({ direction: 'E' }));
    expect(pushed.moved).toBe(true);
    expect(pushed.push).toEqual({ direction: 'E', ejected: [] });
    expect(pushed.state).toMatchObject({ ...PUSHED, beaten: 0, enemies: ['(7,5)', '(8,4)', '(7,6)'] });
    const row = value(open.state({ radius: 1 })).window.rows.find((r) => r.r === 6)!;
    expect(row.cells[7 - row.q0]).toBe('E');
    const refused = failure(open.step({ direction: 'E' }));
    expect(refused.code).toBe('blocked');
    expect(refused.message).toContain('an enemy stands there');
  });

  test('a walk to (5,6) takes the same path and ends on the push, the hero on (6,6)', () => {
    const open = world();
    value(open.newWorld({ seed: 1 }));
    const walked = value(open.walk({ q: 5, r: 6 }));
    expect(walked.steps).toBe(11);
    expect(walked.pushes).toEqual([{ direction: 'E', ejected: [] }]);
    expect(walked.state).toMatchObject(PUSHED);
  });
});

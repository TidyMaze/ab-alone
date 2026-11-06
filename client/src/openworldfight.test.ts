import './test/openworldwasm';
import { describe, expect, it } from 'vitest';
import { type Axial } from './board';
import { CHUNK, World } from './openworld';
import { FightState } from './openworldfight';

// Grass at height 1 in the square -3..3 of chunks; the generated enemies (5,5) and (6,5) start in chunk (0,0).
function grass(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 0], i * 3);
  return out;
}
const world = () =>
  new World(grass, (cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(5, 5, 6, 5) : new Int32Array()));

describe('the enemies of the fight', () => {
  it('starts with the generated enemies as they are', () => {
    const w = world();
    const fight = new FightState();
    expect(fight.enemiesAround(w, [0, 0], 11)).toEqual([[5, 5], [6, 5]]);
    expect(fight.enemiesAround(w, [0, 0], 10)).toEqual([[5, 5]]); // (6,5) is 11 cells away
    expect(fight.occupied(w, 5, 5)).toBe(true);
    expect(fight.occupied(w, 0, 0)).toBe(false);
    expect(fight.beaten).toBe(0);
  });

  it('a push moves the enemies: the old cells are free, the new ones are taken', () => {
    const w = world();
    const fight = new FightState();
    fight.apply([[5, 5], [6, 5]], [[6, 5], [7, 5]], []);
    expect(fight.occupied(w, 5, 5)).toBe(false);
    expect(fight.occupied(w, 6, 5)).toBe(true);
    expect(fight.occupied(w, 7, 5)).toBe(true);
    expect(fight.enemiesAround(w, [0, 0], 12)).toEqual([[6, 5], [7, 5]]); // (7,5) is 12 cells away
    expect(fight.beaten).toBe(0);
  });

  it('an enemy pushed into another chunk stands there, and its generated cell is free again', () => {
    const w = world();
    const fight = new FightState();
    fight.apply([[5, 5]], [[16, 5]], []); // into chunk (1,0)
    expect(fight.occupied(w, 5, 5)).toBe(false);
    expect(fight.occupied(w, 16, 5)).toBe(true);
    expect(fight.chunkEnemies(w, 1, 0)).toEqual([[16, 5]]);
    expect(fight.chunkEnemies(w, 0, 0)).toEqual([[6, 5]]);
    expect(fight.enemiesAround(w, [16, 5], 1)).toEqual([[16, 5]]);
  });

  it('an enemy pushed back to where it started leaves no trace', () => {
    const fight = new FightState();
    fight.apply([[5, 5]], [[5, 4]], []);
    fight.apply([[5, 4]], [[5, 5]], []);
    expect(fight.toJSON()).toEqual({ removed: [], added: [], beaten: 0 });
  });

  it('an ejected enemy is gone and counts as beaten', () => {
    const w = world();
    const fight = new FightState();
    // The line (5,5), (6,5) pushed east: the last enemy (6,5) falls, (5,5) moves onto (6,5).
    fight.apply([[5, 5], [6, 5]], [[6, 5]], [[6, 5]]);
    expect(fight.occupied(w, 5, 5)).toBe(false);
    expect(fight.occupied(w, 6, 5)).toBe(true);
    expect(fight.enemiesAround(w, [0, 0], 11)).toEqual([[6, 5]]);
    expect(fight.beaten).toBe(1);
  });

  it('hiding the generated enemies of a square leaves only the enemies applied after', () => {
    const w = world();
    const fight = new FightState();
    fight.hide(w, 0, 0, 1);
    expect(fight.occupied(w, 5, 5)).toBe(false);
    expect(fight.enemiesAround(w, [0, 0], 11)).toEqual([]);
    fight.apply([], [[2, 0]], []);
    expect(fight.enemiesAround(w, [0, 0], 11)).toEqual([[2, 0]]);
    expect(fight.occupied(w, 2, 0)).toBe(true);
  });

  it('a reset gives back the generated enemies, and no beaten count', () => {
    const w = world();
    const fight = new FightState();
    fight.apply([[5, 5], [6, 5]], [[6, 5]], [[6, 5]]);
    fight.apply([[6, 5]], [[16, 5]], []);
    fight.reset();
    expect(fight.toJSON()).toEqual({ removed: [], added: [], beaten: 0 });
    expect(fight.enemiesAround(w, [0, 0], 11)).toEqual([[5, 5], [6, 5]]);
  });

  it('an enemy applied on a hidden generated cell is shown there again', () => {
    const w = world();
    const fight = new FightState();
    fight.hide(w, 0, 0, 1);
    fight.apply([], [[5, 5]], []);
    expect(fight.occupied(w, 5, 5)).toBe(true);
    expect(fight.toJSON().added).toEqual([]);
  });

  it('is saved as plain data and restored as it was', () => {
    const w = world();
    const fight = new FightState();
    fight.apply([[5, 5], [6, 5]], [[6, 5]], [[6, 5]]);
    fight.apply([[6, 5]], [[16, 5]], []);
    const saved = JSON.parse(JSON.stringify(fight)) as unknown;
    expect(saved).toEqual(fight.toJSON());
    const back = FightState.fromJSON(saved as ReturnType<FightState['toJSON']>);
    expect(back.toJSON()).toEqual(fight.toJSON());
    expect(back.enemiesAround(w, [0, 0], 20)).toEqual(fight.enemiesAround(w, [0, 0], 20));
    expect(back.beaten).toBe(1);
  });

  it('plays the troop push on the overlay: no push, a slide, an ejection off the world', () => {
    const w = new World(grass, (cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(1, 0) : new Int32Array()));
    const fight = new FightState();
    expect(fight.troopPush(w, 9, [[0, 0]], [], 1)).toBeNull();
    const slid = fight.troopPush(w, 9, [[0, 0], [-1, 0], [-2, 0]], [], 1);
    expect(slid).toEqual({
      from: [[0, 0], [-1, 0], [-2, 0]],
      foes: [[1, 0]],
      push: { troop: [[1, 0], [0, 0], [-1, 0]], enemies: [[2, 0]], ejected: [], homes: [], dir: [1, 0] },
    });
    expect(fight.chunkEnemies(w, 0, 0)).toEqual([[2, 0]]);
    expect(fight.nearHero(w, [0, 0])).toEqual([[2, 0]]);
    // The world ends at q = 511: the enemy on (511,0) is pushed off it.
    const edge = new World(grass, (cx, cy) => (cx === 31 && cy === 0 ? Int32Array.of(511, 0) : new Int32Array()));
    const out = new FightState().troopPush(edge, 9, [[510, 0], [509, 0]], [], 1);
    expect(out!.push.ejected).toEqual([[511, 0]]);
    // A single marble shoves a foe off the world too (#1504): it takes the foe's cell.
    const shove = new FightState().troopPush(edge, 9, [[510, 0]], [], 1);
    expect(shove!.push).toEqual({ troop: [[511, 0]], enemies: [], ejected: [[511, 0]], homes: [[511, 0]], dir: [1, 0] });
  });

  it('gives the cells the herd sends the followers to, none without a hunt (#1506)', () => {
    // Seed 1: a foe on (9,-30) with the water three cells away; the hero stands behind it, the follower flanks.
    const foe = new World(grass, (cx, cy) => (cx === 0 && cy === -2 ? Int32Array.of(9, -30) : new Int32Array()));
    expect(new FightState().herdGoals(foe, 1, [[8, -30], [7, -30]], [])).toEqual([[0, [9, -31]]]);
    expect(new FightState().herdGoals(world(), 9, [[0, 0], [1, 0]], [])).toEqual([]);
  });

  it('an enemy on a cell no generated enemy starts on is added to the overlay', () => {
    const cell: Axial = [-3, 7];
    const fight = new FightState();
    fight.apply([], [cell], []);
    expect(fight.toJSON().added).toEqual([cell]);
  });
});

describe('a saved fight is read back only when it is whole (#968)', () => {
  it('restores a whole save, and a fight that does not decode starts fresh', () => {
    const fight = new FightState();
    fight.apply([], [[3, 0]], [[9, 9]]);
    expect(FightState.fromJSON(JSON.parse(JSON.stringify(fight))).toJSON()).toEqual(fight.toJSON());
    const garbage: unknown[] = [
      null,
      'x',
      { removed: 'x', added: [], beaten: 0 },
      { removed: ['2;0'], added: [], beaten: 0 },
      { removed: [], added: [[1]], beaten: 0 },
      { removed: [], added: [[1.5, 0]], beaten: 0 },
      { removed: [], added: [], beaten: -1 },
      { removed: [], added: [], beaten: 0.5 },
      { removed: [], added: [] },
    ];
    for (const raw of garbage) expect(FightState.fromJSON(raw).toJSON(), JSON.stringify(raw)).toEqual({ removed: [], added: [], beaten: 0 });
  });
});

describe('a save written before the engine held the fight', () => {
  // The exact JSON of `FightState.toJSON` as it was written by the TypeScript overlay: keys as `q,r` strings, the order they went in.
  const old = { removed: ['5,5', '-3,12', '6,5'], added: [[7, 5], [-2, 1]], beaten: 2 };

  it('loads and writes back the same JSON', () => {
    const fight = FightState.fromJSON(JSON.parse(JSON.stringify(old)));
    expect(JSON.parse(JSON.stringify(fight))).toEqual(old);
    expect(fight.beaten).toBe(2);
  });

  it('keeps the enemies it saved: the pushed ones stand, the removed generated ones are gone', () => {
    const fight = FightState.fromJSON(old);
    const world = new World(grass, () => Int32Array.of(5, 5, 6, 5));
    expect(fight.occupied(world, 7, 5)).toBe(true);
    expect(fight.occupied(world, 5, 5)).toBe(false);
    expect(fight.chunkEnemies(world, 0, 0)).toEqual([[7, 5]]);
  });
});

describe('the wandering marbles (#1511)', () => {
  // A chunk of the grass world whose group is away from where it starts at some tick of the seed 3: found, not assumed.
  const rows = (cx: number, cy: number): Int32Array => (cx === 0 && cy === 0 ? Int32Array.of(5, 5, 6, 5) : new Int32Array());
  const wanderer = () => {
    const w = new World(grass, rows);
    const fight = new FightState();
    for (let tick = 1; tick < 200; tick++) {
      fight.setClock(3, tick);
      const [first] = fight.chunkEnemies(w, 0, 0);
      if (first![0] !== 5 || first![1] !== 5) return { w, fight, tick, offset: [first![0] - 5, first![1] - 5] as Axial };
    }
    throw new Error('the group never walks');
  };

  it('has the clock at tick 0, where every marble starts, and a tick length in ms', () => {
    const w = world();
    const fight = new FightState();
    fight.setClock(3, 0);
    expect(fight.chunkEnemies(w, 0, 0)).toEqual([[5, 5], [6, 5]]);
    expect(FightState.tickMs).toBe(1200);
  });

  it('holds the cells of the troop: a group whose next cell is held waits, and walks on once the cell is free (#1590)', () => {
    const { w, fight, tick, offset } = wanderer();
    const next: Axial = [5 + offset[0], 5 + offset[1]];
    fight.setHeld([next]);
    fight.setClock(3, tick);
    expect(fight.chunkEnemies(w, 0, 0)).not.toContainEqual(next);
    fight.setHeld([]);
    expect(fight.chunkEnemies(w, 0, 0)).toContainEqual(next);
  });

  it('places the generated marbles where the clock has them, in every question about them', () => {
    const { w, fight, offset } = wanderer();
    const [dq, dr] = offset;
    expect(fight.chunkEnemies(w, 0, 0)).toEqual([[5 + dq, 5 + dr], [6 + dq, 5 + dr]]);
    expect(fight.occupied(w, 5 + dq, 5 + dr)).toBe(true);
    expect(fight.occupied(w, 5, 5)).toBe(false);
    expect(fight.enemiesAround(w, [5 + dq, 5 + dr], 1)).toContainEqual([5 + dq, 5 + dr]);
    expect(fight.nearHero(w, [5 + dq, 5 + dr])).toContainEqual([5 + dq, 5 + dr]);
  });

  it('knows whether the generated marble that starts on a cell is still alive, wherever it wandered to', () => {
    const { w, fight } = wanderer();
    expect(fight.alive(w, [5, 5])).toBe(true);
    expect(fight.alive(w, [7, 7])).toBe(false);
    fight.apply([[5, 5]], [], [[5, 5]]);
    expect(fight.alive(w, [5, 5])).toBe(false);
    expect(fight.alive(w, [6, 5])).toBe(true);
  });

  it('gives the wandering marble that touches the hero, the cell it starts on and the cell it stands on', () => {
    const { w, fight, offset } = wanderer();
    const at: Axial = [5 + offset[0], 5 + offset[1]];
    expect(fight.wildContact(w, at)).toEqual({ home: [5, 5], at });
    expect(fight.wildContact(w, [at[0] + 8, at[1]])).toBeNull();
    fight.apply([[5, 5]], [[40, 40]], []); // a marble a push moved is not a wanderer
    expect(fight.wildContact(w, [40, 40])).toBeNull();
  });

  it('names the cell an ejected wanderer started on, after the troop pushed it where it stood', () => {
    // The group of the chunk stands on (1, 0) at the clock: the line pushes it east into the sea past the edge of the world.
    const edge = new World(grass, (cx, cy) => (cx === 31 && cy === 0 ? Int32Array.of(511, 0) : new Int32Array()));
    const fight = new FightState();
    const out = fight.troopPush(edge, 9, [[510, 0], [509, 0]], [], 1);
    expect(out!.push.homes).toEqual([[511, 0]]);
  });
});

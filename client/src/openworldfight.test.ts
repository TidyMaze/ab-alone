import { describe, expect, it } from 'vitest';
import { type Axial } from './board';
import { CHUNK, World } from './openworld';
import { FightState, readPush } from './openworldfight';

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

  it('reads the push of the bridge: no push, a slide, a water and an edge ejection', () => {
    expect(readPush([])).toBeNull();
    expect(readPush(Int32Array.of(0, 0, 0, 2, 1, 0, 0, 0, 1, 2, 0, 1, 0))).toEqual({
      troop: [[1, 0], [0, 0]],
      enemies: [[2, 0]],
      ejected: [],
      dir: [1, 0],
    });
    expect(readPush([4, 0, 1, 3, 3, 0, 2, 0, 1, 0, 1, 4, 0, 1, 0])).toEqual({
      troop: [[3, 0], [2, 0], [1, 0]],
      enemies: [[4, 0]],
      ejected: [[4, 0]],
      dir: [1, 0],
    });
    expect(readPush([511, 0, 2, 2, 510, 0, 511, 0, 0, 1, 0])).toEqual({
      troop: [[510, 0], [511, 0]],
      enemies: [],
      ejected: [[511, 0]],
      dir: [1, 0],
    });
  });

  it('an enemy on a cell no generated enemy starts on is added to the overlay', () => {
    const cell: Axial = [-3, 7];
    const fight = new FightState();
    fight.apply([], [cell], []);
    expect(fight.toJSON().added).toEqual([cell]);
  });
});

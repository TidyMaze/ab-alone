import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { bearingOf, goalLines, WAYS } from './openworldgoal';
import { SECRETS } from './story';

// The goal of the Open world on arrival (#1530, docs/specs/openworld.md section 14): one sentence of objective and a text bearing to the nearest
// tower not beaten, from the minimap's own turn of the cells (`screenOffset`).

describe('the bearing to a cell (#1530)', () => {
  it('reads the ground as the minimap does: the camera at yaw 0 sees decreasing r straight up, increasing r straight down', () => {
    expect(bearingOf([0, 0], [0, -10], 0)).toEqual({ cells: 10, way: 'straight up' });
    expect(bearingOf([0, 0], [-5, 10], 0).way).toBe('straight down'); // dq + dr / 2 = 0
    expect(bearingOf([0, 0], [7, 0], 0)).toEqual({ cells: 7, way: 'to the right' });
    expect(bearingOf([0, 0], [-7, 0], 0).way).toBe('to the left');
  });

  it('names the four diagonals', () => {
    expect(bearingOf([0, 0], [5, -4], 0).way).toBe('to the upper right'); // dx = 3, dz = -3.5
    expect(bearingOf([0, 0], [1, 4], 0).way).toBe('to the lower right');
    expect(bearingOf([0, 0], [-5, 4], 0).way).toBe('to the lower left');
    expect(bearingOf([0, 0], [-1, -4], 0).way).toBe('to the upper left');
  });

  it('turns with the camera: a quarter turn puts what was on the right straight down or up', () => {
    const ways = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((yaw) => bearingOf([0, 0], [7, 0], yaw).way);
    expect(new Set(ways).size).toBe(4);
    expect(ways).toContain('straight up');
    expect(ways).toContain('straight down');
    expect(ways).toContain('to the left');
    expect(ways).toContain('to the right');
  });

  it('counts the cells as the hex distance, from the hero and not from the origin', () => {
    expect(bearingOf([10, 10], [13, 7], 0).cells).toBe(3);
    expect(bearingOf([0, 0], [3, 4], 0).cells).toBe(7);
    expect(bearingOf([-4, 2], [3, 0], 0).cells).toBe(7);
  });

  it('has eight ways, from straight up clockwise', () => {
    expect(WAYS).toHaveLength(8);
    expect(WAYS[0]).toBe('straight up');
    expect(WAYS[4]).toBe('straight down');
  });
});

describe('the goal lines (#1530)', () => {
  const lairs = (...beaten: boolean[]): { cell: Axial; beaten: boolean }[] => beaten.map((b, i) => ({ cell: [10 * (i + 1), 0], beaten: b }));
  const at = { hero: [0, 0] as Axial, yaw: 0, logsLeft: 0 };

  it('says the objective in one sentence and the bearing to the nearest tower not beaten', () => {
    const { goal, bearing } = goalLines({ ...at, lairs: lairs(false, false, false) });
    expect(goal).toBe('Goal: beat the 3 towers of Hollow. One medal each.');
    expect(bearing).toBe('Nearest tower: 10 cells, to the right.');
  });

  it('skips the towers beaten, and says one cell for a cell', () => {
    expect(goalLines({ ...at, lairs: lairs(true, false) }).bearing).toBe('Nearest tower: 20 cells, to the right.');
    expect(goalLines({ ...at, hero: [9, 0], lairs: lairs(false) }).bearing).toBe('Nearest tower: 1 cell, to the right.');
    expect(goalLines({ ...at, hero: [0, 0], lairs: [{ cell: [30, 0], beaten: false }, { cell: [0, -4], beaten: false }] }).bearing).toBe('Nearest tower: 4 cells, straight up.');
  });

  it('says one tower for a world of one', () => {
    expect(goalLines({ ...at, lairs: lairs(false) }).goal).toBe('Goal: beat the 1 tower of Hollow. One medal each.');
  });

  it('says what is left once every tower is beaten: the lore logs, then the dungeon gates', () => {
    expect(goalLines({ ...at, lairs: lairs(true, true), logsLeft: 3 })).toEqual({ goal: 'Goal done: all 2 towers are beaten.', bearing: 'Left: 3 lore logs to find.' });
    expect(goalLines({ ...at, lairs: lairs(true), logsLeft: 1 }).bearing).toBe('Left: 1 lore log to find.');
    expect(goalLines({ ...at, lairs: lairs(true, true), logsLeft: 0 }).bearing).toBe('Left: the dungeon gates.');
  });

  it('says nothing for a world with no tower', () => {
    expect(goalLines({ ...at, lairs: [] })).toEqual({ goal: '', bearing: '' });
  });

  it('holds no secret word of a later stage, in any state', () => {
    const states = [lairs(false, false), lairs(true, true)].flatMap((l) => [0, 2].map((logsLeft) => goalLines({ ...at, lairs: l, logsLeft })));
    for (const { goal, bearing } of states) for (const { word } of SECRETS) expect(`${goal} ${bearing}`).not.toMatch(word);
  });
});

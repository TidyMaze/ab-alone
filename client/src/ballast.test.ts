import { describe, expect, it } from 'vitest';
import { ballastText, firedText, parseFired } from './ballast';

describe('ballastText', () => {
  it('names the borrowed effect and the boss it comes from, one line per code of the bridge', () => {
    expect([0, 1, 2, 3].map(ballastText)).toEqual([
      "Next turn: the Hull's crack",
      "Next turn: the Pulsar's pulse",
      "Next turn: the Magnetizer's polarity",
      "Next turn: the Chaplain's conversion check",
    ]);
  });

  it('is empty when no effect is due', () => {
    expect(ballastText(-1)).toBe('');
  });
});

describe('parseFired (#838)', () => {
  it('splits the effect code and the cells it touched', () => {
    expect(parseFired([1, 2, -3, 0, 4])).toEqual({ effect: 1, cells: [[2, -3], [0, 4]] });
    expect(parseFired([3])).toEqual({ effect: 3, cells: [] });
  });

  it('is null when the last ply borrowed nothing', () => {
    expect(parseFired([])).toBeNull();
  });

  it('refuses a cell list that is not in pairs', () => {
    expect(() => parseFired([1, 2])).toThrow('fired array length 2');
  });
});

describe('firedText (#838)', () => {
  it('names the effect that just fired, one line per code of the bridge', () => {
    expect([0, 1, 2, 3].map((effect) => firedText({ effect, cells: [] }))).toEqual([
      "Fired: the Hull's crack",
      "Fired: the Pulsar's pulse",
      "Fired: the Magnetizer's polarity",
      "Fired: the Chaplain's conversion check",
    ]);
  });

  it('is empty when nothing fired', () => {
    expect(firedText(null)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { ballastText } from './ballast';

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

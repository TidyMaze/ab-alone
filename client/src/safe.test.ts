import { describe, expect, it } from 'vitest';
import { limitFlash, SAFE_MAX_AMPLITUDE, SAFE_MAX_RATE } from './safe';

describe('photosensitivity safe mode (#380)', () => {
  it('keeps the documented limits: 3 flashes per second, a brightness swing of 0.2', () => {
    expect(SAFE_MAX_RATE).toBe(3);
    expect(SAFE_MAX_AMPLITUDE).toBe(0.2);
  });

  it('caps a fast, strong flash in safe mode', () => {
    expect(limitFlash({ rate: 10, amplitude: 1 }, true)).toEqual({ rate: 3, amplitude: 0.2 });
  });

  it('leaves a gentle flash as it is in safe mode', () => {
    expect(limitFlash({ rate: 1, amplitude: 0.1 }, true)).toEqual({ rate: 1, amplitude: 0.1 });
  });

  it('changes nothing when safe mode is off', () => {
    expect(limitFlash({ rate: 10, amplitude: 1 }, false)).toEqual({ rate: 10, amplitude: 1 });
  });
});

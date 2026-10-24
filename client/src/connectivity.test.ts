import { describe, expect, it } from 'vitest';
import { playOnlineState } from './connectivity';

describe('playOnlineState', () => {
  it('disables Play online and explains why while offline', () => {
    expect(playOnlineState(false, true)).toEqual({ disabled: true, notice: ' · online play needs a connection' });
  });
  it('enables it once the page is ready and online, with no notice', () => {
    expect(playOnlineState(true, true)).toEqual({ disabled: false, notice: '' });
  });
  it('keeps it disabled until the page is ready, even online', () => {
    expect(playOnlineState(true, false)).toEqual({ disabled: true, notice: '' });
  });
});

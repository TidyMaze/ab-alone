// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTouch, keyTip } from './touchwording';

// The wording of a tooltip or a label: a key shortcut on a keyboard, nothing on a touch screen (#1379).
const media = (coarse: boolean): void => void vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('pointer: coarse') }));

describe('touch wording (#1379)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tells a coarse pointer from a fine one, and a page without matchMedia is not touch', () => {
    media(true);
    expect(isTouch()).toBe(true);
    media(false);
    expect(isTouch()).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    expect(isTouch()).toBe(false);
  });

  it('names the key on a keyboard and leaves the bare label on touch', () => {
    media(false);
    expect(keyTip('Next move', 'Right')).toBe('Next move (Right)');
    media(true);
    expect(keyTip('Next move', 'Right')).toBe('Next move');
    expect(keyTip('Next move', 'Right', false)).toBe('Next move (Right)');
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EXIT_MS, ScreenExit } from './screenexit';

// The exit of a screen (#1562, docs/specs/motion.md story 12): a dim over the new screen that starts opaque and lifts in about 120 ms.
const layer = () => document.getElementById('screen-exit');
let reduced = false;
const exit = () => new ScreenExit(() => reduced);

afterEach(() => {
  reduced = false;
  document.body.innerHTML = '';
  for (const key of Object.keys(document.body.dataset)) delete document.body.dataset[key];
});

describe('the exit of a screen', () => {
  it('lasts about 120 ms, inside the fast token and under the base one', () => {
    expect(EXIT_MS).toBe(120);
  });

  it('makes its layer at once, clear, and plays nothing for the first screen seen nor for a screen that stays', () => {
    const e = exit();
    expect(layer()).not.toBeNull();
    e.sync('table');
    e.sync('table');
    expect(layer()!.dataset.flip).toBeUndefined();
  });

  it('plays when the screen changes, and again on the next change, which needs the other keyframes', () => {
    const e = exit();
    e.sync('table');
    e.sync('hub');
    const first = layer()!.dataset.flip;
    expect(first).toMatch(/^[ab]$/);
    e.sync('mode');
    expect(layer()!.dataset.flip).not.toBe(first);
    expect(document.querySelectorAll('#screen-exit')).toHaveLength(1);
  });

  it('is hidden from the accessibility tree', () => {
    const e = exit();
    e.sync('table');
    e.sync('hub');
    expect(layer()!.getAttribute('aria-hidden')).toBe('true');
  });

  it('is cut under reduced motion, and the screen is still remembered', () => {
    const e = exit();
    e.sync('table');
    reduced = true;
    e.sync('hub');
    expect(layer()!.dataset.flip).toBeUndefined();
    reduced = false;
    e.sync('hub');
    expect(layer()!.dataset.flip).toBeUndefined();
  });

  it('does not stack on the transition of a place', () => {
    const e = exit();
    e.sync('hub');
    document.body.dataset.placeTransition = 'enter';
    e.sync('mode');
    expect(layer()!.dataset.flip).toBeUndefined();
  });
});

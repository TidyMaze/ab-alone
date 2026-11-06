// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTER_MS, MAX_STEP_MS, PlaceTransition, RETURN_MS, placeFrame, placeTitle } from './placetransition';

// The one enter-a-place transition of the tower, the dungeon gate and the town (#1519, docs/specs/motion.md story 10).
const root = () => document.getElementById('place-transition')!;
const title = () => root().querySelector('.pt-title')!.textContent;
const body = () => document.body.dataset;
const num = (name: string) => Number(root().style.getPropertyValue(name));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the numbers of the transition', () => {
  it('lasts about 600 ms in, a little less back, both inside the 1.2 s cap of a celebration', () => {
    expect(ENTER_MS).toBe(600);
    expect(RETURN_MS).toBe(400);
    expect(MAX_STEP_MS).toBe(50);
  });

  it('starts dark and shut and ends clear and open, whatever the time given', () => {
    expect(placeFrame(0, true)).toEqual({ dim: 1, open: 0, title: 0 });
    expect(placeFrame(1, true)).toEqual({ dim: 0, open: 1, title: 0 });
    expect(placeFrame(-3, true)).toEqual(placeFrame(0, true));
    expect(placeFrame(9, true)).toEqual(placeFrame(1, true));
  });

  it('lifts the dim evenly and opens the cue fast, then slowly, without ever going back', () => {
    expect(placeFrame(0.5, false).dim).toBe(0.5);
    expect(placeFrame(0.5, false).open).toBeGreaterThan(0.8);
    let last = placeFrame(0, false);
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const now = placeFrame(t, false);
      expect(now.dim).toBeLessThanOrEqual(last.dim);
      expect(now.open).toBeGreaterThanOrEqual(last.open);
      last = now;
    }
  });

  it('shows the title in the middle, fading in at the start and out at the end, and never without a title to show', () => {
    expect(placeFrame(0.5, true).title).toBe(1);
    expect(placeFrame(0.075, true).title).toBeCloseTo(0.5);
    expect(placeFrame(0.9, true).title).toBeCloseTo(0.5);
    for (const t of [0, 0.3, 0.5, 0.9, 1]) expect(placeFrame(t, false).title).toBe(0);
  });
});

describe('the title of a place', () => {
  it('is the boss name for a tower, and the name of the place with the mode it opens for a town and a gate (#1547)', () => {
    expect(placeTitle('tower', 'The Echo')).toBe('The Echo');
    expect(placeTitle('town', 'The Echo')).toBe('Muster point · the Hub');
    expect(placeTitle('dungeon', 'The Echo')).toBe('Mining cut · Rogue-lite run');
  });
});

describe('entering a place', () => {
  it('draws the cue of the kind over the page at once, with the title, and takes no press', () => {
    const t = new PlaceTransition(() => false);
    t.enter('tower', 'The Echo');
    expect(root().dataset.kind).toBe('tower');
    expect(root().hidden).toBe(false);
    expect(title()).toBe('The Echo');
    expect(body().placeTransition).toBe('enter');
    expect(num('--dim')).toBe(1);
    expect(num('--open')).toBe(0);
  });

  it('plays the frames in time and is gone after 600 ms', () => {
    const t = new PlaceTransition(() => false);
    t.enter('dungeon', 'Rogue-lite run');
    vi.advanceTimersByTime(ENTER_MS / 2);
    expect(num('--open')).toBeGreaterThan(0.5);
    expect(num('--dim')).toBeLessThan(0.6);
    expect(num('--title')).toBe(1);
    expect(body().placeTransition).toBe('enter');
    vi.advanceTimersByTime(ENTER_MS);
    expect(root().hidden).toBe(true);
    expect(body().placeTransition).toBeUndefined();
  });

  it('counts a frame that came late as a short one, so a place that is slow to draw does not eat the transition', () => {
    let next: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => ((next = f), 1));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const t = new PlaceTransition(() => false);
    t.enter('town', 'Hub');
    next(1000);
    next(1016);
    next(6000); // 5 s with no frame
    expect(root().hidden).toBe(false);
    expect(num('--open')).toBeLessThan(0.3);
    for (let now = 6016, i = 0; i < 40 && !root().hidden; i++, now += 16) next(now);
    expect(root().hidden).toBe(true);
    vi.unstubAllGlobals();
  });

  it('is skipped to its end by a press, a tap or a new key, and the same press goes on to the page', () => {
    for (const type of ['pointerdown', 'keydown']) {
      const t = new PlaceTransition(() => false);
      t.enter('town', 'Hub');
      const seen = vi.fn();
      window.addEventListener(type, seen);
      window.dispatchEvent(new Event(type));
      expect(root().hidden).toBe(true);
      expect(body().placeTransition).toBeUndefined();
      expect(seen).toHaveBeenCalledTimes(1);
      window.removeEventListener(type, seen);
    }
  });

  it('is not skipped by the repeat of a held key, nor by a press once it is over', () => {
    const t = new PlaceTransition(() => false);
    t.enter('town', 'Hub');
    window.dispatchEvent(new KeyboardEvent('keydown', { repeat: true }));
    expect(root().hidden).toBe(false);
    vi.advanceTimersByTime(ENTER_MS + 50);
    const seen = vi.spyOn(window, 'removeEventListener');
    window.dispatchEvent(new Event('pointerdown'));
    expect(seen).not.toHaveBeenCalled();
  });

  it('starts again from the top when a second place is entered, and ends the first', () => {
    const t = new PlaceTransition(() => false);
    t.enter('tower', 'The Echo');
    vi.advanceTimersByTime(300);
    t.enter('dungeon', 'Rogue-lite run');
    expect(root().dataset.kind).toBe('dungeon');
    expect(title()).toBe('Rogue-lite run');
    expect(num('--open')).toBe(0);
    expect(document.querySelectorAll('#place-transition')).toHaveLength(1);
  });

  it('makes its element again when the page cleared it', () => {
    const t = new PlaceTransition(() => false);
    t.enter('town', 'Hub');
    document.body.innerHTML = '';
    t.enter('town', 'Hub');
    expect(document.querySelectorAll('#place-transition')).toHaveLength(1);
  });
});

describe('under reduced motion', () => {
  it('cuts the motion and keeps the title, still and whole, until the press or 600 ms', () => {
    const t = new PlaceTransition(() => true);
    t.enter('tower', 'The Echo');
    expect(title()).toBe('The Echo');
    expect(root().dataset.motion).toBe('cut');
    expect(num('--dim')).toBe(0);
    expect(num('--open')).toBe(1);
    expect(num('--title')).toBe(1);
    vi.advanceTimersByTime(ENTER_MS - 1);
    expect(root().hidden).toBe(false);
    expect(num('--open')).toBe(1);
    vi.advanceTimersByTime(ENTER_MS / 4);
    expect(root().hidden).toBe(true);
  });

  it('is ended by a press too', () => {
    const t = new PlaceTransition(() => true);
    t.enter('town', 'Hub');
    window.dispatchEvent(new Event('pointerdown'));
    expect(root().hidden).toBe(true);
    vi.advanceTimersByTime(ENTER_MS);
    expect(body().placeTransition).toBeUndefined();
  });

  it('shows no return at all: a hard cut', () => {
    new PlaceTransition(() => true).back('tower');
    expect(document.getElementById('place-transition')).toBeNull();
    expect(body().placeTransition).toBeUndefined();
  });
});

describe('coming back to the world', () => {
  it('plays the same cue of the kind without a title, for 400 ms', () => {
    const t = new PlaceTransition(() => false);
    t.back('dungeon');
    expect(root().dataset.kind).toBe('dungeon');
    expect(title()).toBe('');
    expect(body().placeTransition).toBe('back');
    vi.advanceTimersByTime(RETURN_MS / 2);
    expect(num('--title')).toBe(0);
    expect(num('--open')).toBeGreaterThan(0.5);
    vi.advanceTimersByTime(RETURN_MS);
    expect(root().hidden).toBe(true);
  });

  it('can be ended by hand, and ending nothing does nothing', () => {
    const t = new PlaceTransition(() => false);
    t.end();
    t.back('town');
    t.end();
    expect(root().hidden).toBe(true);
    expect(body().placeTransition).toBeUndefined();
  });
});

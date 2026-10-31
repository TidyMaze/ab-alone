// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindHudFold, HUD_FOLD_MS, HUD_FOLD_STEPS, shouldFold } from './openworldfold';

describe('the fold rule of the Open world HUD plate (#1138)', () => {
  it('folds after 3 steps or after 8 s from the entry, whichever comes first', () => {
    expect(HUD_FOLD_STEPS).toBe(3);
    expect(HUD_FOLD_MS).toBe(8000);
    expect(shouldFold(0, 0)).toBe(false);
    expect(shouldFold(2, 7999)).toBe(false);
    expect(shouldFold(3, 100)).toBe(true);
    expect(shouldFold(0, 8000)).toBe(true);
    expect(shouldFold(1, 9000)).toBe(true);
  });
});

describe('the plate and its chip', () => {
  let hud: HTMLElement;
  let chip: HTMLButtonElement;
  const settle = () => vi.advanceTimersByTimeAsync(0); // the observer's records are delivered in a microtask
  const enter = async (seed = '7') => {
    document.body.dataset.openworld = seed;
    await settle();
  };
  const walk = async (cell: string) => {
    document.body.dataset.openworldAt = cell;
    await settle();
  };
  const folded = () => hud.dataset.folded === '1';

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="openworld-hud"></div><button id="openworld-chip" hidden aria-expanded="true"></button>';
    document.body.removeAttribute('data-openworld');
    document.body.removeAttribute('data-openworld-at');
    hud = document.getElementById('openworld-hud')!;
    chip = document.getElementById('openworld-chip') as HTMLButtonElement;
    bindHudFold(document);
  });
  afterEach(async () => {
    delete document.body.dataset.openworld; // the mode is left: the observers of this test see it
    await settle();
    vi.useRealTimers();
  });

  it('shows the plate at the entry, the chip hidden', async () => {
    await enter();
    expect(folded()).toBe(false);
    expect(chip.hidden).toBe(true);
  });

  it('folds to the chip after 3 steps, and counts only the steps that move the hero', async () => {
    await enter();
    await walk('0,0');
    await walk('0,0'); // a mark that moves nothing (a resize)
    await walk('1,0');
    await walk('2,0');
    expect(folded()).toBe(false);
    await walk('3,0');
    expect(folded()).toBe(true);
    expect(chip.hidden).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('folds after 8 s with no step', async () => {
    await enter();
    await vi.advanceTimersByTimeAsync(HUD_FOLD_MS - 1);
    expect(folded()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(folded()).toBe(true);
    expect(chip.hidden).toBe(false);
  });

  it('opens again with the chip, and folds back after the next 3 steps, not on the clock', async () => {
    await enter();
    await walk('0,0'); // the entry marks the hero's cell
    await vi.advanceTimersByTimeAsync(HUD_FOLD_MS);
    chip.click();
    expect(folded()).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    await vi.advanceTimersByTimeAsync(5 * HUD_FOLD_MS);
    expect(folded()).toBe(false); // no clock on a plate the player asked for
    await walk('1,0');
    await walk('2,0');
    expect(folded()).toBe(false);
    await walk('3,0');
    expect(folded()).toBe(true);
  });

  it('starts over when the world is left or another one is entered, and keeps no clock behind', async () => {
    await enter();
    await walk('1,0');
    await walk('2,0');
    await enter('9'); // another seed: the steps start again
    await walk('3,0');
    expect(folded()).toBe(false);
    await vi.advanceTimersByTimeAsync(HUD_FOLD_MS - 1);
    expect(folded()).toBe(false); // the clock started again with the new entry
    delete document.body.dataset.openworld;
    await settle();
    await vi.advanceTimersByTimeAsync(2 * HUD_FOLD_MS);
    expect(folded()).toBe(false);
    expect(chip.hidden).toBe(true);
    await enter('7'); // a fresh entry shows the plate again
    expect(folded()).toBe(false);
  });

  it('shows the plate again at the next entry after a fold', async () => {
    await enter();
    await vi.advanceTimersByTimeAsync(HUD_FOLD_MS);
    expect(folded()).toBe(true);
    delete document.body.dataset.openworld;
    await settle();
    expect(folded()).toBe(false);
    expect(chip.hidden).toBe(true);
  });

  it('ignores the marks of a world that is already entered (the same seed again)', async () => {
    await enter();
    await vi.advanceTimersByTimeAsync(HUD_FOLD_MS - 10);
    await enter(); // a mark rewrites the same seed
    await vi.advanceTimersByTimeAsync(10);
    expect(folded()).toBe(true); // the clock was not restarted
  });
});

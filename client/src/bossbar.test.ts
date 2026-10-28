// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { drawBossBar } from './bossbar';

// The boss health bar (#788): the name above, one fragment per ejection the player needs, the phase steps marked.
const bar = { name: 'The Hull', ejected: 0, win: 6, steps: [3, 5] };
let el: HTMLElement;
const frags = (): Element[] => [...el.querySelectorAll('.frag')];
const empty = (): number[] => frags().flatMap((f, i) => (f.classList.contains('empty') ? [i] : []));
const stepped = (): number[] => frags().flatMap((f, i) => (f.classList.contains('step') ? [i] : []));

beforeEach(() => {
  el = document.createElement('div');
  el.hidden = true;
});

describe('drawBossBar', () => {
  it('hides the bar when there is no boss', () => {
    drawBossBar(el, bar);
    drawBossBar(el, null);
    expect(el.hidden).toBe(true);
  });

  it('shows the name and one full fragment per ejection needed', () => {
    drawBossBar(el, bar);
    expect(el.hidden).toBe(false);
    expect(el.querySelector('.name')!.textContent).toBe('The Hull');
    expect(frags()).toHaveLength(6);
    expect(empty()).toEqual([]);
  });

  it('makes as many fragments as the engine asks, 12 for The Ballast Mind', () => {
    drawBossBar(el, { name: 'The Ballast Mind', ejected: 0, win: 12, steps: [3, 6] });
    expect(frags()).toHaveLength(12);
  });

  it('empties one fragment from the right per ejection', () => {
    drawBossBar(el, { ...bar, ejected: 2 });
    expect(empty()).toEqual([4, 5]);
    drawBossBar(el, { ...bar, ejected: 6 });
    expect(empty()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('marks the fragment where each phase step falls, the steps counted from the full bar', () => {
    drawBossBar(el, bar);
    expect(stepped()).toEqual([1, 3]); // 3 ejections leave 3 full fragments, 5 leave 1
  });

  it('empties the fragments of the same bar in place, so the CSS transition runs', () => {
    drawBossBar(el, bar);
    const first = frags()[5];
    drawBossBar(el, { ...bar, ejected: 1 });
    expect(frags()[5]).toBe(first);
    expect(first!.classList.contains('empty')).toBe(true);
  });

  it('draws a new bar when the boss or its target changes', () => {
    drawBossBar(el, bar);
    drawBossBar(el, { name: 'The Alien', ejected: 0, win: 6, steps: [2, 4] });
    expect(el.querySelector('.name')!.textContent).toBe('The Alien');
    expect(stepped()).toEqual([2, 4]);
  });

  it('reads as a meter for a screen reader, the name never as markup', () => {
    drawBossBar(el, { name: '<b>The Hull</b>', ejected: 2, win: 6, steps: [3, 5] });
    const meter = el.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-label')).toBe('<b>The Hull</b> health');
    expect(meter.getAttribute('aria-valuemax')).toBe('6');
    expect(meter.getAttribute('aria-valuenow')).toBe('4');
    expect(meter.getAttribute('aria-valuetext')).toBe('2 of 6 ejected, phase 1 of 3');
    expect(el.querySelector('.name b')).toBeNull();
    drawBossBar(el, { name: 'The Hull', ejected: 5, win: 6, steps: [3, 5] });
    expect(meter.getAttribute('aria-valuetext')).toBe('5 of 6 ejected, phase 3 of 3');
  });
});

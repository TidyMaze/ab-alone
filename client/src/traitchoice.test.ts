// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askMirror, type TraitChoiceDom } from './traitchoice';

const memory = (saved?: string): Storage => {
  const items = new Map<string, string>(saved === undefined ? [] : [['ab-alone.medals', saved]]);
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
};

const dom = (): TraitChoiceDom => {
  document.body.innerHTML = '<div id="t" hidden><p id="tt"></p><button id="ty"></button><button id="tn"></button></div>';
  return {
    panel: document.getElementById('t')!,
    text: document.getElementById('tt')!,
    yes: document.getElementById('ty') as HTMLButtonElement,
    no: document.getElementById('tn') as HTMLButtonElement,
  };
};

describe('the mirror choice before a tower (#1620)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts the fight at once, without the mirror, when the choice is not offered', () => {
    const d = dom();
    const start = vi.fn();
    askMirror(d, memory(), false, start);
    expect(start).toHaveBeenCalledWith(false);
    expect(d.panel.hidden).toBe(true);
  });

  it('asks with the mirror first, the cost in its words, and the fight waits for the answer', () => {
    const d = dom();
    const start = vi.fn();
    askMirror(d, memory('{"echo":9}'), true, start);
    expect(d.panel.hidden).toBe(false);
    expect(d.yes.textContent).toMatch(/^Bring the Echo's mirror \(cost: /);
    expect(d.no.textContent).toBe('Fight without');
    expect(start).not.toHaveBeenCalled();
  });

  it('brings the mirror when chosen, and saves the pick with the medals', () => {
    const d = dom();
    const store = memory('{"echo":9}');
    const start = vi.fn();
    askMirror(d, store, true, start);
    d.yes.click();
    expect(start).toHaveBeenCalledWith(true);
    expect(d.panel.hidden).toBe(true);
    expect(store.getItem('ab-alone.medal-trait')).toBe('mirror');
  });

  it('fights without the mirror when declined, and saves that pick', () => {
    const d = dom();
    const store = memory('{"echo":9}');
    const start = vi.fn();
    askMirror(d, store, true, start);
    d.no.click();
    expect(start).toHaveBeenCalledWith(false);
    expect(store.getItem('ab-alone.medal-trait')).toBe('none');
  });

  it('focuses the last pick, and asking again does not start the fight twice', () => {
    const d = dom();
    const store = memory('{"echo":9}');
    store.setItem('ab-alone.medal-trait', 'mirror');
    const start = vi.fn();
    askMirror(d, store, true, start);
    expect(document.activeElement).toBe(d.yes);
    askMirror(d, store, true, start);
    d.no.click();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

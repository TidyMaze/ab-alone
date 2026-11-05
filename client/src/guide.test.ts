import { describe, expect, it } from 'vitest';
import { GUIDE, guideDue, guideSeen, guideStep, writeGuideSeen } from './guide';
import type { Store } from './quality';

const memory = (): Store => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

describe('the first-launch guide (#1293)', () => {
  it('opens only when ?guide asks for it, and never once seen: a first launch plays the first run instead (#1521)', () => {
    const store = memory();
    expect(guideDue(store, '')).toBe(false); // no longer automatic: the first run (firstrun.ts) replaces it
    expect(guideDue(store, '?bot=off')).toBe(false);
    expect(guideDue(store, '?bot=off&guide')).toBe(true);
    writeGuideSeen(store);
    expect(guideSeen(store)).toBe(true);
    expect(store!.getItem('ab-alone.guide')).toBe('seen');
    expect(guideDue(store, '?guide')).toBe(false);
  });

  it('asks again at every ?guide when storage is blocked, where no setting lasts', () => {
    expect(guideSeen(null)).toBe(false);
    expect(guideDue(null, '?guide')).toBe(true);
  });

  it('steps forward to the end, back to the first page, and closes on a skip or past the last page', () => {
    expect(guideStep(0, 'next')).toBe(1);
    expect(guideStep(GUIDE.length - 2, 'next')).toBe(GUIDE.length - 1);
    expect(guideStep(GUIDE.length - 1, 'next')).toBeNull();
    expect(guideStep(2, 'back')).toBe(1);
    expect(guideStep(0, 'back')).toBe(0);
    for (let at = 0; at < GUIDE.length; at++) expect(guideStep(at, 'skip')).toBeNull();
  });

  it('shows the goal, a move, a push, the 3:2 rule, then the controls', () => {
    expect(GUIDE.map((page) => page.title)).toEqual(['Push them into the void', 'Move', 'Push', 'Out-number them', 'Controls']);
    expect(GUIDE[0]!.text).toContain('six');
    for (const page of GUIDE) expect(page.text).not.toMatch(/pale|shell|glass/i); // one vocabulary, as the HUD's: White and Black (#1523)
    expect(GUIDE[0]!.text).toMatch(/You are White.*Black marbles/);
    expect(GUIDE[3]!.text).toMatch(/3.*2/);
  });

  it('names the controls of each platform: the mouse and keys, touch, and the pad', () => {
    const controls = GUIDE[4]!.text;
    expect(controls).toMatch(/<p data-controls="mouse">Click[^<]*Q W E A S D/);
    expect(controls).toMatch(/<p data-controls="touch">Tap[^<]*pinch/);
    expect(controls).toMatch(/<p data-controls="pad">[^<]*A plays, B backs out/);
    for (const page of GUIDE.slice(0, 4)) expect(page.text).not.toContain('data-controls');
  });

  it('draws each page as an inline SVG of the game marbles, decorative, with no external asset', () => {
    for (const page of GUIDE) {
      expect(page.art).toMatch(/^<svg viewBox="0 0 260 120" aria-hidden="true" focusable="false"/);
      expect(page.art).toContain('url(#guide-glass)'); // the player's pale glass
      expect(page.art).not.toMatch(/https?:|href=/);
    }
    for (const page of GUIDE.slice(0, 4)) expect(page.art).toContain('url(#guide-shell)'); // their black shells
    expect(GUIDE[3]!.art).toContain('class="no"'); // the equal lines that cannot push are crossed out
  });
});

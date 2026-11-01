import { describe, expect, it } from 'vitest';
import { GUIDE, guideDue, guideSeen, guideStep, writeGuideSeen } from './guide';
import type { Store } from './quality';

const memory = (): Store => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

describe('the first-launch guide (#1293)', () => {
  it('opens on a first launch, never once seen, and not in an automated browser unless ?guide asks for it', () => {
    const store = memory();
    expect(guideDue(store, '', false)).toBe(true);
    expect(guideDue(store, '?bot=off', true)).toBe(false); // the e2e specs boot on a fresh profile: no guide over them
    expect(guideDue(store, '?bot=off&guide', true)).toBe(true);
    writeGuideSeen(store);
    expect(guideSeen(store)).toBe(true);
    expect(store!.getItem('ab-alone.guide')).toBe('seen');
    expect(guideDue(store, '', false)).toBe(false);
    expect(guideDue(store, '?guide', true)).toBe(false);
  });

  it('opens at every launch when storage is blocked, where no setting lasts', () => {
    expect(guideSeen(null)).toBe(false);
    expect(guideDue(null, '', false)).toBe(true);
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

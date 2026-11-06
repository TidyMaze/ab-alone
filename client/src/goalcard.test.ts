// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { goalCardHtml, ECHO_STEPS } from './goalcard';
import { SECRETS } from './story';

// The goal card of The Echo (#1524, docs/specs/ui.md section 4.8): two short steps and a picture in place of the boss's one long goal line.
const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

describe('the goal card of The Echo (#1524)', () => {
  it('is two short steps in order and a picture of the game\'s marbles', () => {
    const doc = parse(goalCardHtml('echo'));
    expect([...doc.querySelectorAll('ol.goal-steps > li')].map((li) => li.textContent)).toEqual([...ECHO_STEPS]);
    expect(ECHO_STEPS).toHaveLength(2);
    for (const step of ECHO_STEPS) expect(step.length).toBeLessThanOrEqual(100);
    const svg = doc.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('circle').length).toBeGreaterThanOrEqual(6); // cells and marbles
    expect(svg.querySelectorAll('[stroke-dasharray]').length).toBeGreaterThan(0); // the mirror line and the free move's ghosts
  });

  it('says how it is won and that a draw loses, then the free mirror, in the HUD\'s words: Black, eject', () => {
    expect(ECHO_STEPS[0]).toMatch(/Eject 6 Black marbles to win/);
    expect(ECHO_STEPS[0]).toMatch(/draw loses/);
    expect(ECHO_STEPS[1]).toMatch(/mirror/);
    expect(ECHO_STEPS[1]).toMatch(/free/);
  });

  it('holds no secret word of a later stage of the story, and uses no id another picture of the page has', () => {
    const html = goalCardHtml('echo');
    for (const { word } of SECRETS) expect(html).not.toMatch(word);
    expect(html).not.toContain('guide-glass'); // the guide's gradients may sit in a hidden dialog
  });

  it('is the card of The Echo alone: another boss, or none, keeps its goal line', () => {
    expect(goalCardHtml('hull')).toBe('');
    expect(goalCardHtml(undefined)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { bossHtml, goalShown } from './bosshud';

const base = { name: 'The Echo', phase: 0, phases: 3, result: 0 };

describe('bossHtml', () => {
  it('shows the boss name', () => {
    expect(bossHtml(base)).toContain('The Echo');
  });

  it('draws one notch per phase, labelled P1 to P3, the current one marked', () => {
    const html = bossHtml({ ...base, phase: 1 });
    for (const label of ['P1', 'P2', 'P3']) expect(html).toContain(label);
    expect(html.match(/class="notch( active)?"/g)).toHaveLength(3);
    expect(html.match(/class="notch active"/g)).toHaveLength(1);
    expect(html).toMatch(/class="notch active"[^>]*>P2</);
  });

  it('shows no result while the fight runs', () => {
    expect(bossHtml(base)).not.toMatch(/Victory|Defeat/);
  });

  it('says Victory on a win and Defeat on a loss, a draw included', () => {
    expect(bossHtml({ ...base, result: 1 })).toContain('Victory');
    expect(bossHtml({ ...base, result: 2 })).toContain('Defeat');
  });

  it('shows the boss tell line when there is one, nothing otherwise', () => {
    expect(bossHtml({ ...base, tell: 'Cracks: 1 cell in 2 turns' })).toContain(
      '<div class="tell">Cracks: 1 cell in 2 turns</div>',
    );
    expect(bossHtml(base)).not.toContain('class="tell"');
    expect(bossHtml({ ...base, tell: '' })).not.toContain('class="tell"');
    expect(bossHtml({ ...base, tell: '<i>' })).not.toContain('<i>');
  });

  it('shows the daily challenge line of a daily fight, nothing otherwise', () => {
    expect(bossHtml({ ...base, daily: 'Daily challenge 2026-10-24 · attempt 2' })).toContain(
      '<div class="daily">Daily challenge 2026-10-24 · attempt 2</div>',
    );
    expect(bossHtml(base)).not.toContain('class="daily"');
    expect(bossHtml({ ...base, daily: '' })).not.toContain('class="daily"');
    expect(bossHtml({ ...base, daily: '<i>' })).not.toContain('<i>');
  });

  it('shows the goal line of the boss, nothing when there is none', () => {
    expect(bossHtml({ ...base, goal: 'Eject 6 of its marbles to win.' })).toContain(
      '<div class="goal">Goal: Eject 6 of its marbles to win.</div>',
    );
    expect(bossHtml(base)).not.toContain('class="goal"');
    expect(bossHtml({ ...base, goal: '<i>' })).not.toContain('<i>');
  });

  it('escapes the boss name', () => {
    expect(bossHtml({ ...base, name: '<b>x</b>' })).not.toContain('<b>');
  });
});

describe('goalShown', () => {
  it('shows the goal before the first move, whatever the control says', () => {
    expect(goalShown(0, false)).toBe(true);
    expect(goalShown(0, true)).toBe(true);
  });

  it('hides it from the first move on, until the control asks for it', () => {
    expect(goalShown(1, false)).toBe(false);
    expect(goalShown(8, false)).toBe(false);
    expect(goalShown(1, true)).toBe(true);
    expect(goalShown(8, true)).toBe(true);
  });
});

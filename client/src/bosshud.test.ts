import { describe, expect, it } from 'vitest';
import { bossHtml } from './bosshud';

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

  it('escapes the boss name', () => {
    expect(bossHtml({ ...base, name: '<b>x</b>' })).not.toContain('<b>');
  });
});

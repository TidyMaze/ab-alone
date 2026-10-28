// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { choirChips, drawChoirChips } from './choirchips';
import type { Member } from './choir';

// The Choir's army chips (#816): `[Alto 5] > [Tenor 6] > [Bass 4]`, built from the bridge's armies and next_army.
const army = (n: number, count: number): Member[] => Array.from({ length: count }, (_, i) => ({ cell: [i, n], army: n }));
const all = [...army(0, 5), ...army(1, 6), ...army(2, 4)];

describe('choirChips', () => {
  it('lists the armies in play order with their marbles left and the next one marked', () => {
    expect(choirChips(all, 1)).toEqual([
      { name: 'Alto', glyph: '▲', left: 5, next: false, double: false },
      { name: 'Tenor', glyph: '○', left: 6, next: true, double: false },
      { name: 'Bass', glyph: '■', left: 4, next: false, double: false },
    ]);
  });

  it('drops a removed army so the others close up', () => {
    expect(choirChips([...army(0, 5), ...army(2, 4)], 2).map((c) => c.name)).toEqual(['Alto', 'Bass']);
  });

  it('marks the last army as playing twice', () => {
    expect(choirChips(army(2, 3), 2)).toEqual([{ name: 'Bass', glyph: '■', left: 3, next: true, double: true }]);
  });

  it('has no chip without a Choir army', () => {
    expect(choirChips([], -1)).toEqual([]);
  });
});

describe('drawChoirChips', () => {
  let bar: HTMLElement;
  beforeEach(() => {
    bar = document.createElement('div');
  });

  it('draws the chips with a > between them and highlights the next army', () => {
    drawChoirChips(bar, choirChips(all, 1));
    const row = bar.querySelector('.chips') as HTMLElement;
    expect(row.hidden).toBe(false);
    expect(row.textContent!.replace(/\s+/g, ' ')).toBe('▲ Alto 5 > ○ Tenor 6 > ■ Bass 4');
    expect([...row.querySelectorAll('.chip')].map((c) => c.classList.contains('next'))).toEqual([false, true, false]);
    expect(row.querySelector('.next')!.getAttribute('aria-current')).toBe('step');
  });

  it('shows ×2 on the last army only', () => {
    drawChoirChips(bar, choirChips(army(1, 2), 1));
    expect(bar.querySelector('.chips')!.textContent).toContain('Tenor 2 ×2');
    expect(bar.querySelectorAll('.arrow')).toHaveLength(0);
  });

  it('redraws in place and hides without chips', () => {
    drawChoirChips(bar, choirChips(all, 0));
    drawChoirChips(bar, choirChips(all, 2));
    expect(bar.querySelectorAll('.chips')).toHaveLength(1);
    expect(bar.querySelector('.next')!.textContent).toContain('Bass');
    drawChoirChips(bar, []);
    expect((bar.querySelector('.chips') as HTMLElement).hidden).toBe(true);
  });

  it('does nothing for another boss', () => {
    drawChoirChips(bar, null);
    expect(bar.querySelector('.chips')).toBeNull();
  });
});

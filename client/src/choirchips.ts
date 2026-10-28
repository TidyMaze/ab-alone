// The Choir's army chips (#816, docs/specs/ui.md 4): beside the boss bar, `[▲ Alto 5] > [○ Tenor 6] > [■ Bass 4]`, the three
// armies in play order with their marbles left. The army that moves next is highlighted (the pale ring of its board tell),
// a removed army is gone and the arrows close up, the last army reads "×2" (it plays twice). Text and glyph, never colour
// alone. The order and counts come from the bridge's armies() and next_army().
import { ARMY_NAMES, armiesLeft, type Member } from './choir';

/** The glyphs worn by the armies' marbles on the board: Alto a spike, Tenor a ring, Bass a block. */
const ARMY_GLYPHS = ['▲', '○', '■'] as const;

export interface Chip {
  name: string;
  glyph: string;
  left: number; // marbles left
  next: boolean; // moves next
  double: boolean; // the last army, plays two moves a boss turn
}

/** One chip per army that still has a marble, in play order. */
export function choirChips(members: readonly Member[], next: number): Chip[] {
  const double = armiesLeft(members) === 1;
  return ARMY_NAMES.flatMap((name, army) => {
    const left = members.filter((m) => m.army === army).length;
    return left === 0 ? [] : [{ name, glyph: ARMY_GLYPHS[army]!, left, next: army === next, double }];
  });
}

/** Draws `chips` in the row of `bar`, made on the first call; no row without a Choir (`null`), an empty one is hidden. */
export function drawChoirChips(bar: HTMLElement, chips: readonly Chip[] | null): void {
  let row = bar.querySelector<HTMLElement>('.chips');
  if (!row && chips === null) return;
  if (!row) {
    row = document.createElement('div');
    row.className = 'chips';
    row.setAttribute('role', 'list');
    row.setAttribute('aria-label', 'Army play order');
    bar.append(row);
  }
  row.hidden = chips === null || chips.length === 0;
  row.innerHTML = (chips ?? [])
    .map((c) => {
      const cue = c.next ? ' next" aria-current="step' : '';
      const twice = c.double ? ' <span class="twice">×2</span>' : '';
      return `<span class="chip${cue}" role="listitem"><span class="glyph" aria-hidden="true">${c.glyph}</span> ${c.name} ${c.left}${twice}</span>`;
    })
    .join(' <span class="arrow" aria-hidden="true">&gt;</span> ');
}

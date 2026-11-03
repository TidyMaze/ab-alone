import { describe, expect, it } from 'vitest';
import { fuseDigit, fuseNote, parseFuses } from './specialcues';

// The Bomb's fuse on screen (#1490, docs/specs/roguelite.md section 13): the bridge's records, the HUD line and the digit
// drawn on the Bomb.
describe('the Bomb fuse', () => {
  it('parseFuses splits the bridge records into cells and turns left', () => {
    expect(parseFuses([])).toEqual([]);
    expect(parseFuses([0, 4, 3, -2, 1, 1])).toEqual([
      { cell: [0, 4], turns: 3 },
      { cell: [-2, 1], turns: 1 },
    ]);
  });

  it('fuseNote says the turns left of one Bomb or of several, nothing without a Bomb', () => {
    expect(fuseNote([])).toBe('');
    expect(fuseNote([{ cell: [0, 4], turns: 3 }])).toBe(' · Bomb: 3 turns left');
    expect(fuseNote([{ cell: [0, 4], turns: 1 }])).toBe(' · Bomb: 1 turn left');
    expect(fuseNote([{ cell: [0, 4], turns: 3 }, { cell: [1, 4], turns: 1 }])).toBe(' · Bombs: 3, 1 turns left');
  });

  it('fuseDigit draws 1, 2 and 3 in seven bar segments inside the Bomb glyph, a 1 with two bars, the others with five', () => {
    expect([1, 2, 3].map((n) => fuseDigit(n).length)).toEqual([2, 5, 5]);
    for (const n of [1, 2, 3]) {
      for (const [x, y, w, h] of fuseDigit(n)) {
        expect(Math.hypot(Math.max(Math.abs(x), Math.abs(x + w)), Math.max(Math.abs(y), Math.abs(y + h)))).toBeLessThan(0.8);
      }
    }
  });
});

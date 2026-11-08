import { describe, expect, it } from 'vitest';
import { filtered, FILTER_LIST, FILTER_WORDS } from './namefilter';

describe('namefilter (#1652)', () => {
  it('ships a lowercase data list, each entry refused as typed', () => {
    expect(FILTER_WORDS.length).toBe(FILTER_LIST.length);
    for (const w of FILTER_LIST) {
      expect(w).toBe(w.toLowerCase());
      expect(filtered(w), w).toBe(true);
    }
  });

  it('refuses the puns in any case, spacing, accent, leetspeak or camel case', () => {
    for (const n of ['EDGING', 'Edging King', 'E.D.G.I.N.G', 'e d g i n g', 'Édging', '3dg1ng', 'xMrEdgingx', 'Mr_Edgin', 'l’edgeuse', 'Edgıng', 'edgeu$e', '3dg3ur']) expect(filtered(n), n).toBe(true);
  });

  it('keeps the name, its official short form and the innocent words', () => {
    for (const n of ['Edgefall', 'Edge', 'edge', 'Ledge', 'hedging', 'Pledging Ana', 'Sledging', 'Ada', '', 'anonymous', '\u{1F600}']) expect(filtered(n), n).toBe(false);
  });
});

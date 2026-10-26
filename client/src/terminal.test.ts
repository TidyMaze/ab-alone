import { describe, expect, it } from 'vitest';
import { LORE } from './lore';
import { drawTerminal, pageAt, TERMINAL, terminalFonts, terminalPages, wrap, type TerminalPage } from './terminal';
import { UI_SCALES } from './uiscale';

// The deck console's text (#511): a lore entry wrapped to the screen and paged for the UI scale.

/** A font as wide as half its size per character, so a larger UI scale fits fewer words on a line. */
const measure = (text: string, font: string): number => text.length * Number(/([\d.]+)px/.exec(font)![1]) * 0.5;

/** A canvas context that records the text it fills, with the font and the place of each. */
function recorder() {
  const texts: { text: string; x: number; y: number; font: string; align: string }[] = [];
  const rects: number[][] = [];
  const g = {
    font: '',
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: (...r: number[]) => void rects.push(r),
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: this.font, align: this.textAlign });
    },
  };
  return { g: g as unknown as CanvasRenderingContext2D, texts, rects, state: g };
}

describe('wrap', () => {
  it('fills each line with as many words as fit, in order', () => {
    const width = (t: string): number => t.length;
    expect(wrap('one two three four five', 9, width)).toEqual(['one two', 'three', 'four five']);
  });

  it('puts a word wider than the line alone on its own line', () => {
    expect(wrap('a enormous b', 4, (t) => t.length)).toEqual(['a', 'enormous', 'b']);
  });

  it('ignores runs of spaces', () => {
    expect(wrap('  a   b  ', 10, (t) => t.length)).toEqual(['a b']);
  });
});

describe('terminalFonts', () => {
  it('grows the title and body fonts with the UI scale, in the page web fonts', () => {
    expect(terminalFonts(100)).toEqual({ title: '600 24px "Chakra Petch"', body: '400 24px "IBM Plex Sans"' });
    expect(terminalFonts(200)).toEqual({ title: '600 48px "Chakra Petch"', body: '400 48px "IBM Plex Sans"' });
  });
});

describe('terminalPages', () => {
  const entry = LORE[0]!;

  it('keeps every word of the body, in order, over its pages, with the title on each page', () => {
    for (const scale of UI_SCALES) {
      const pages = terminalPages(entry, scale, measure);
      expect(pages.flatMap((p) => p.body).join(' '), `${scale}`).toBe(entry.body.split(/\s+/).join(' '));
      for (const [i, p] of pages.entries()) {
        expect(p.title.join(' ')).toBe(entry.title);
        expect([p.page, p.pages]).toEqual([i, pages.length]);
      }
    }
  });

  it('needs more pages at a larger UI scale', () => {
    const counts = UI_SCALES.map((scale) => terminalPages(entry, scale, measure).length);
    expect(counts[0]).toBeLessThan(counts[counts.length - 1]!);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
  });

  it('fits every line of every entry inside the screen at every UI scale, clear of the page count', () => {
    for (const e of LORE)
      for (const scale of UI_SCALES)
        for (const page of terminalPages(e, scale, measure)) {
          const { g, texts } = recorder();
          drawTerminal(g, page, scale);
          const size = (scale * TERMINAL.size) / 100;
          const count = texts[texts.length - 1]!;
          for (const t of texts) {
            expect(t.y, `${e.id} ${scale}`).toBeGreaterThanOrEqual(TERMINAL.pad);
            expect(t.y + size, `${e.id} ${scale}`).toBeLessThanOrEqual(TERMINAL.height - TERMINAL.pad);
            if (t !== count) {
              expect(t.x + measure(t.text, t.font)).toBeLessThanOrEqual(TERMINAL.width - TERMINAL.pad);
              expect(t.y + size, `${e.id} ${scale}`).toBeLessThanOrEqual(count.y);
            }
          }
        }
  });
});

describe('drawTerminal', () => {
  const page: TerminalPage = { title: ['Log'], body: ['first line', 'second line'], page: 1, pages: 3 };

  it('clears the whole screen, then draws the title, the body and the page count', () => {
    const { g, texts, rects, state } = recorder();
    drawTerminal(g, page, 100);
    expect(rects).toEqual([[0, 0, TERMINAL.width, TERMINAL.height]]);
    expect(texts.map((t) => [t.text, t.font, t.align])).toEqual([
      ['Log', '600 24px "Chakra Petch"', 'left'],
      ['first line', '400 24px "IBM Plex Sans"', 'left'],
      ['second line', '400 24px "IBM Plex Sans"', 'left'],
      ['2/3', '400 24px "IBM Plex Sans"', 'right'],
    ]);
    expect(texts[1]!.y).toBeGreaterThan(texts[0]!.y + 24); // a blank line under the title
    expect(texts[2]!.y).toBeGreaterThan(texts[1]!.y + 24);
    expect(texts[3]!.x).toBe(TERMINAL.width - TERMINAL.pad);
    expect([state.textAlign, state.textBaseline]).toEqual(['left', 'top']); // left as it found it
  });
});

describe('pageAt', () => {
  it('turns the page every pageMs, back to the first after the last', () => {
    expect(TERMINAL.pageMs).toBe(8000);
    expect([0, 7999, 8000, 16000, 24000].map((ms) => pageAt(ms, 3))).toEqual([0, 0, 1, 2, 0]);
    expect(pageAt(50000, 1)).toBe(0);
  });
});

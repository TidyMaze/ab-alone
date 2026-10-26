// The deck console's text (#511, docs/specs/world.md section 4): a lore entry wrapped to the screen's width and cut into
// pages for the UI scale, the title on top of each page and the page count at the bottom. Pure layout: main.ts measures
// the words with the canvas, draws a page with drawTerminal and turns the pages with pageAt.
import type { LoreEntry } from './lore';
import type { UiScale } from './uiscale';

/** The screen's canvas in pixels (the console screen is 2.8 by 1.4), its margin, the font size at 100 %, and how long a
 *  page stays: a page turn every 8 s is far under the 3 a second of safe mode. */
export const TERMINAL = { width: 1024, height: 512, pad: 40, size: 24, pageMs: 8000 } as const;
const LINE = 1.35; // the line height, in font sizes
const SCREEN = '#0f1c18'; // the dark phosphor glass of the console-screen prop
const INK = '#b8d8c8';
const DIM = '#6f8c80';

export interface TerminalFonts {
  title: string;
  body: string;
}

/** The canvas fonts at a UI scale: the page's two web fonts (index.html), the display one for the title. */
export const terminalFonts = (scale: UiScale): TerminalFonts => {
  const px = (TERMINAL.size * scale) / 100;
  return { title: `600 ${px}px "Chakra Petch"`, body: `400 ${px}px "IBM Plex Sans"` };
};

/** The words of `text` in lines no wider than `width`; a word wider than a line stands alone on its own. */
export function wrap(text: string, width: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export interface TerminalPage {
  title: string[];
  body: string[];
  page: number; // from 0
  pages: number;
}

/** An entry's pages at a UI scale; `measure` gives the width of a text in a canvas font. */
export function terminalPages(
  entry: Pick<LoreEntry, 'title' | 'body'>,
  scale: UiScale,
  measure: (text: string, font: string) => number,
): TerminalPage[] {
  const fonts = terminalFonts(scale);
  const width = TERMINAL.width - 2 * TERMINAL.pad;
  const title = wrap(entry.title, width, (t) => measure(t, fonts.title));
  const body = wrap(entry.body, width, (t) => measure(t, fonts.body));
  // The lines a screen holds, less the title, a blank line under it and the page count.
  const lines = Math.floor((TERMINAL.height - 2 * TERMINAL.pad) / ((TERMINAL.size * scale * LINE) / 100));
  const rows = Math.max(1, lines - title.length - 2);
  const pages = Math.max(1, Math.ceil(body.length / rows));
  return Array.from({ length: pages }, (_, page) => ({
    title,
    body: body.slice(page * rows, (page + 1) * rows),
    page,
    pages,
  }));
}

/** Draws a page over the whole canvas. */
export function drawTerminal(g: CanvasRenderingContext2D, page: TerminalPage, scale: UiScale): void {
  const { width, height, pad } = TERMINAL;
  const fonts = terminalFonts(scale);
  const line = (TERMINAL.size * scale * LINE) / 100;
  g.fillStyle = SCREEN;
  g.fillRect(0, 0, width, height);
  g.textBaseline = 'top';
  g.fillStyle = INK;
  g.font = fonts.title;
  page.title.forEach((text, i) => g.fillText(text, pad, pad + i * line));
  g.font = fonts.body;
  page.body.forEach((text, i) => g.fillText(text, pad, pad + (page.title.length + 1 + i) * line));
  g.fillStyle = DIM;
  g.textAlign = 'right';
  g.fillText(`${page.page + 1}/${page.pages}`, width - pad, height - pad - line);
  g.textAlign = 'left';
}

/** The page shown `ms` after the entry came up: the next one every pageMs, back to the first after the last. */
export const pageAt = (ms: number, pages: number): number => Math.floor(ms / TERMINAL.pageMs) % pages;

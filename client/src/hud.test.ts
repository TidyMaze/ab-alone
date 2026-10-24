import { describe, expect, it } from 'vitest';
import { hudHtml } from './hud';
import css from './ui.css?raw';

const TOKENS = ['bg', 'panel', 'edge', 'text', 'muted', 'accent', 'hazard', 'danger'];

// The dark theme is :root, the light one is the media query and the data-theme override.
const blocks = {
  dark: css.match(/:root\s*\{([^}]*)\}/)![1]!,
  lightMedia: css.match(/prefers-color-scheme:\s*light\)\s*\{\s*:root:not\(\[data-theme='dark'\]\)\s*\{([^}]*)\}/)![1]!,
  lightForced: css.match(/:root\[data-theme='light'\]\s*\{([^}]*)\}/)![1]!,
};

describe('palette tokens', () => {
  for (const [name, block] of Object.entries(blocks)) {
    it(`defines every token in the ${name} block`, () => {
      for (const token of TOKENS) expect(block).toMatch(new RegExp(`--${token}:\\s*#[0-9a-f]{6};`));
    });
  }

  it('turns animation off under prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe('hudHtml', () => {
  const base = { side: 1, status: 0, score: 'Black ejected 0/6 · White ejected 0/6', ejected: [0, 0] as const, note: 'WebGL2' };

  it('says whose turn it is', () => {
    expect(hudHtml(base)).toContain('Black to move');
    expect(hudHtml({ ...base, side: 2 })).toContain('White to move');
  });

  it('keeps the score text verbatim and the note', () => {
    const html = hudHtml(base);
    expect(html).toContain('Black ejected 0/6 · White ejected 0/6');
    expect(html).toContain('WebGL2');
  });

  it('shows the winner line instead of the turn when the game is over', () => {
    const html = hudHtml({ ...base, status: 2, score: 'White wins by 6 ejections · x' });
    expect(html).toContain('White wins');
    expect(html).not.toContain('to move');
  });

  it('shows the online status line with its tone, and none offline', () => {
    const html = hudHtml({ ...base, online: { text: 'You are Black. Waiting for an opponent...', tone: 'waiting' } });
    expect(html).toContain('<div class="presence waiting">You are Black. Waiting for an opponent...</div>');
    expect(hudHtml(base)).not.toContain('presence');
  });

  it('names a draw', () => {
    expect(hudHtml({ ...base, status: 3 })).toContain('Draw');
  });

  it('draws six pips per side, scratched once a marble is ejected', () => {
    const html = hudHtml({ ...base, ejected: [2, 6] });
    expect(html.match(/class="pip"/g)).toHaveLength(12 - 8);
    expect(html.match(/class="pip out"/g)).toHaveLength(8);
  });
});

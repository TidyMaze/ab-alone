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

describe('end of game styles, #282', () => {
  it('has one animation per outcome on the rim light, keeps the middle clear, and drops the light under reduced motion', () => {
    for (const anim of ['win', 'loss', 'draw']) {
      expect(css).toMatch(new RegExp(`body\\[data-over='${anim}'\\]::before \\{[^}]*animation: end-${anim} [^}]*forwards`));
      expect(css).toContain(`@keyframes end-${anim}`);
    }
    expect(css).toMatch(/body\[data-over\]::before \{[^}]*pointer-events: none[^}]*mask-image: radial-gradient\(ellipse at center, transparent 62%/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ body\[data-over\]::before \{ display: none; \} \}/);
    expect(css).toMatch(/body\[data-over\] canvas \{ filter: brightness/);
  });
});

describe('hudHtml', () => {
  const base = { side: 1, status: 0, score: 'Black ejected 0/6 · White ejected 0/6', ejected: [0, 0] as const, win: [6, 6] as const, note: 'WebGL2', glass: 2 };

  it('says whose turn it is', () => {
    expect(hudHtml(base)).toContain('Black to move');
    expect(hudHtml({ ...base, side: 2 })).toContain('White to move');
  });

  it('names the sides after the glass: against the bot the pale side 1 is White to move, and wins', () => {
    expect(hudHtml({ ...base, glass: 1 })).toContain('White to move');
    expect(hudHtml({ ...base, glass: 1, side: 2 })).toContain('Black to move');
    expect(hudHtml({ ...base, glass: 1, status: 2 })).toContain('Black wins');
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

  it('shows the rematch line once someone asked, and none otherwise, #186', () => {
    const online = { text: 'You are Black. White is here.', tone: 'here' as const };
    const html = hudHtml({ ...base, status: 3, online, rematch: 'White asks for a rematch.' });
    expect(html).toContain('<div class="rematch">White asks for a rematch.</div>');
    expect(hudHtml({ ...base, status: 3, online, rematch: '' })).not.toContain('rematch');
    expect(hudHtml({ ...base, status: 3, online })).not.toContain('rematch');
  });

  it('shows the end banner in place of the turn line: title, reason, animation id, #282', () => {
    const end = { title: 'You win', line: '6 out. The books balance.', anim: 'win' as const };
    const html = hudHtml({ ...base, status: 1, end });
    expect(html).toContain('<span>You win</span>');
    expect(html).toContain('<div class="end" data-anim="win">6 out. The books balance.</div>');
    expect(html).not.toContain('Black wins');
    expect(hudHtml(base)).not.toContain('class="end"');
  });

  it('names a draw', () => {
    expect(hudHtml({ ...base, status: 3 })).toContain('Draw');
  });

  it('draws six pips per side, scratched once a marble is ejected', () => {
    const html = hudHtml({ ...base, ejected: [2, 6] });
    expect(html.match(/class="pip"/g)).toHaveLength(12 - 8);
    expect(html.match(/class="pip out"/g)).toHaveLength(8);
  });

  it('draws one pip per ejection a side needs: 10 for Black against the Choir, Decision #131', () => {
    const html = hudHtml({ ...base, win: [10, 6], ejected: [3, 1] });
    const [black, white] = html.match(/<span>(<span class="pip[^"]*"><\/span>)+<\/span>/g)!;
    expect(black!.match(/class="pip/g)).toHaveLength(10);
    expect(white!.match(/class="pip/g)).toHaveLength(6);
    expect(html.match(/class="pip out"/g)).toHaveLength(4);
  });
});

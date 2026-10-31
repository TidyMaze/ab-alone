import { describe, expect, it } from 'vitest';
import { flatHudHtml, hudHtml } from './hud';
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

  it('turns animation off under the Reduced motion setting, not the media query (#379)', () => {
    expect(css).toMatch(/:root\[data-motion='reduced'\] \*, :root\[data-motion='reduced'\] \*::before, :root\[data-motion='reduced'\] \*::after \{ animation-duration: 0s !important; transition-duration: 0s !important; \}/);
    expect(css).not.toContain('prefers-reduced-motion');
  });
});

describe('settings menu held upright or in a narrow or short window, #414', () => {
  it('shows each item as its icon only, a 44 px square', () => {
    const icons = css.match(/@media \(orientation: portrait\), \(max-width: 1100px\), \(max-height: 500px\) \{[^]*?\n\}/)![0];
    expect(icons).toContain('#settings-menu button span { display: none; }');
    expect(icons).toMatch(/#settings-menu button \{[^}]*min-width: 2\.75rem; min-height: 2\.75rem;[^}]*\}/);
  });

  it('lays the icons out in rows of 3 under the cog when the window is wider than tall', () => {
    const rows = css.match(/@media \(orientation: landscape\) and \(max-width: 1100px\), \(orientation: landscape\) and \(max-height: 500px\) \{[^]*?\n\}/)![0];
    expect(rows).toMatch(/#settings-menu \{[^}]*display: grid; grid-template-columns: repeat\(3, 2\.75rem\);/);
    expect(rows).toContain('#settings-menu .setting-group { grid-column: span 2; }'); // Clear board and FPS side by side (#426)
  });
});

describe('settings menu in a window wider than tall, #483', () => {
  // e2e/phone-layout.spec.ts, a desktop window: the menu grew to its skin pairs' names and covered cell 4,0.
  it('keeps the width of its other rows: a skin pair adds none and wraps its buttons when their names do not fit', () => {
    const landscape = css.match(/@media \(orientation: landscape\) \{[^]*?\n\}/)![0];
    expect(landscape).toContain('.skin-pair { contain: inline-size; flex-wrap: wrap; }');
  });
});

describe('end of game styles, #282', () => {
  it('has one animation per outcome on the rim light, keeps the middle clear, and drops the light under reduced motion', () => {
    for (const anim of ['win', 'loss', 'draw']) {
      expect(css).toMatch(new RegExp(`body\\[data-over='${anim}'\\]::before \\{[^}]*animation: end-${anim} [^}]*forwards`));
      expect(css).toContain(`@keyframes end-${anim}`);
    }
    expect(css).toMatch(/body\[data-over\]::before \{[^}]*pointer-events: none[^}]*mask-image: radial-gradient\(ellipse at center, transparent 62%/);
    expect(css).toContain(":root[data-motion='reduced'] body[data-over]::before { display: none; }");
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

  it("says Your turn or Partner's turn in place of Black to move on a co-op human ply, and the winner once over (#530)", () => {
    expect(hudHtml({ ...base, turn: "Partner's turn" })).toContain("<span>Partner's turn</span>");
    expect(hudHtml({ ...base, turn: "Partner's turn" })).not.toContain('to move');
    expect(hudHtml({ ...base, turn: 'Your turn', status: 2 })).toContain('White wins');
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

  it("colours each side's pips as its marble: dark for Black, pale for White, #1038", () => {
    const rows = (glass: number) => [...hudHtml({ ...base, glass }).matchAll(/<span class="(dark|pale)">/g)].map((m) => m[1]);
    expect(rows(2)).toEqual(['dark', 'pale']); // Black is side 1, the enemy shell
    expect(rows(1)).toEqual(['pale', 'dark']); // against the bot, side 1 wears the glass and is White
  });

  it('draws one pip per ejection a side needs: 10 for Black against the Choir, Decision #131', () => {
    const html = hudHtml({ ...base, win: [10, 6], ejected: [3, 1] });
    const [black, white] = html.match(/<span class="(?:dark|pale)">(<span class="pip[^"]*"><\/span>)+<\/span>/g)!; // the rows carry their marble colour (#1038)
    expect(black!.match(/class="pip/g)).toHaveLength(10);
    expect(white!.match(/class="pip/g)).toHaveLength(6);
    expect(html.match(/class="pip out"/g)).toHaveLength(4);
  });
});

describe('the Tally line, #294', () => {
  const base = {
    side: 1,
    status: 0,
    glass: 0,
    score: '0 out',
    ejected: [0, 0] as const,
    win: [6, 6] as const,
    note: '',
  };

  it('shows the line in the plate, after the turn line', () => {
    const html = hudHtml({ ...base, tally: 'Mess: two crews, one table. Ledger open.' });
    expect(html).toContain('<div class="tally">Mess: two crews, one table. Ledger open.</div>');
    expect(html.indexOf('class="tally"')).toBeGreaterThan(html.indexOf('class="turn"'));
  });

  it('shows no tally element when there is no line', () => {
    expect(hudHtml(base)).not.toContain('class="tally"');
  });

  it('fades out the tally line after 5 seconds via CSS animation (#425)', () => {
    expect(css).toMatch(/#hud \.tally \{[^}]*animation:\s*tally-fade 1s ease-out 4s forwards;/);
    expect(css).toContain('@keyframes tally-fade');
  });

  // #1038: on a phone the pips alone show the ejected count. The score text stays for a screen reader, one name for the count.
  it('hides the score text on a phone held upright, out of sight but in the accessibility tree', () => {
    expect(css).toMatch(/@media \(orientation: portrait\) \{\s*#hud \.score \{[^}]*clip-path: inset\(50%\);[^}]*\}/);
  });

  it('hides the redundant pips on compact/mobile screens (#425)', () => {
    expect(css).toMatch(/@media [^{]*max-width:\s*1100px[^{]*\{[^]*?#hud \.pips \{ display: none; \}/);
  });
});

describe('flatHudHtml, the flat HUD fallback (#391)', () => {
  const game = { side: 1, status: 0, glass: 2, ejected: [1, 4] as const, win: [6, 6] as const };

  it('gives the turn owner and the ejected count as text', () => {
    expect(flatHudHtml(game)).toBe('<div class="flat"><div>Turn: Black</div><div>Ejected: Black 1/6, White 4/6</div></div>');
    expect(flatHudHtml({ ...game, side: 2, glass: 1 })).toContain('<div>Turn: Black</div><div>Ejected: White 1/6, Black 4/6</div>');
  });

  it('says the game is over instead of a turn owner', () => {
    expect(flatHudHtml({ ...game, status: 3 })).toContain('<div>Turn: game over</div>');
  });

  it('adds the boss phase and the tell countdown in a boss fight', () => {
    expect(flatHudHtml({ ...game, boss: { phase: 1, phases: 3, tell: '2 cells in 3 plies' } })).toContain(
      '<div>Boss phase: 2 of 3</div><div>Tell: 2 cells in 3 plies</div>',
    );
    expect(flatHudHtml({ ...game, boss: { phase: 0, phases: 2, tell: '' } })).toContain('<div>Boss phase: 1 of 2</div><div>Tell: none</div>');
  });
});

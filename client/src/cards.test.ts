import { describe, expect, it } from 'vitest';
import css from './ui.css?raw';

// #1136, PR 3: the lobby sheet, the daily result card and the end of a game keep the dark theme's look, refined: its plates and ink,
// the amber accent, 6 px radii, 48 px buttons, an 8 px grid, a primary button filled, no backdrop blur.
describe('the lobby sheet and the result cards, #1136', () => {
  it('defines the shared tokens, the light theme keeping its own accent and fill', () => {
    const root = css.match(/:root\s*\{[^}]*--amber:[^}]*\}/)?.[0] ?? '';
    for (const token of ['amber: #ffb000', 'plate-accent: #ffb000', 'active-fill: #ffb000', 'r-card: 6px', 'r-button: 6px', 'space: 8px', 'target: 48px']) {
      expect(root).toContain(`--${token};`);
    }
    expect(css).toMatch(/:root\[data-theme='light'\] \{ --plate-accent: #0a5f73; --active-fill: #1b1f23;/);
  });

  it('gives the lobby sheet and the daily card a 6 px radius, the amber accent and an 8 px gap', () => {
    expect(css).toMatch(/:root\[data-palette='default'\] :is\(#dock-wrap :is\(#lobby-sheet, #daily-card\), #hud \.end\) \{ --accent: var\(--plate-accent\); \}/);
    expect(css).toMatch(/#dock-wrap :is\(#lobby-sheet, #daily-card\) \{[^}]*gap: var\(--space\);[^}]*border-radius: var\(--r-card\);/);
  });

  it('draws their buttons and fields as 6 px, 48 px high, Start and Copy result filled', () => {
    expect(css).toMatch(/#dock-wrap :is\(#lobby-sheet, #daily-card\) :is\(button, input, textarea\) \{[^}]*border-radius: var\(--r-button\);/);
    expect(css).toMatch(/#dock-wrap #lobby-sheet button, #dock-wrap #daily-card #daily-copy \{[^}]*min-height: var\(--target\);/);
    expect(css).toMatch(/#dock-wrap :is\(#royale-start, #daily-copy\) \{[^}]*background: var\(--active-fill\);[^}]*color: var\(--active-ink\);/);
  });

  it('uses no backdrop blur', () => {
    expect(css).not.toContain('backdrop-filter');
  });
});

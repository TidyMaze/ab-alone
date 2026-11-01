import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import css from './ui.css?raw';

// The Open world plate and joystick (#1138): the dark plate with rivets and the amber accent, whatever the system theme.
const rule = (selector: string): string => css.match(new RegExp(`^${selector.replace(/[#.[\]()]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))![1]!;

describe('the Open world HUD plate (#1138)', () => {
  it('is the dark plate with light ink and the amber accent, in both themes', () => {
    const plate = rule('#openworld-hud');
    expect(plate).toContain('background-color: var(--panel)');
    expect(plate).toContain('color: var(--text)');
    expect(plate).toContain('border: 1px solid var(--edge)');
    expect(plate).toContain('border-radius: var(--r-card)');
    expect(plate).toContain('--accent: var(--plate-accent)');
    expect(plate).not.toContain('--panel:');
    expect(plate).not.toContain('--edge:');
  });

  it('has no local hex colour on the plate, its buttons or the chip (#1172): they follow the theme and the palette', () => {
    for (const selector of ['#openworld-hud', '#openworld-chip', '#openworld-hud button', '#openworld-hud button:focus-visible', '#openworld-hud button:active', '#openworld-chip:focus-visible', '#openworld-chip:active']) {
      expect(rule(selector), selector).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });

  it('is bolted like the other plates: a rivet in each corner', () => {
    const plate = rule('#openworld-hud');
    expect(plate).toContain('--rivet: radial-gradient(circle, var(--edge) 2px, transparent 2.5px)');
    expect(plate.match(/var\(--rivet\)/g)).toHaveLength(4);
  });

  it('folds with the motion tokens (0 ms under Reduced motion), out of the way and out of reach', () => {
    const folded = rule('#openworld-hud[data-folded]');
    expect(folded).toContain('opacity: 0');
    expect(folded).toContain('pointer-events: none');
    expect(folded).toContain('visibility: hidden');
    expect(rule('#openworld-hud')).toContain('transition: opacity var(--motion-base)');
  });

  it('leaves a chip in the bottom-left corner, the same radius as the plate, a target of the shared size, only in the world and only while folded', () => {
    const chip = rule('#openworld-chip');
    expect(chip).toContain('min-width: var(--target)');
    expect(chip).toContain('min-height: var(--target)');
    expect(chip).toContain('border-radius: var(--r-card)');
    expect(chip).toContain('left: 1rem');
    expect(chip).toContain('bottom: 1rem');
    expect(chip).toContain('border: 1px solid var(--edge)');
    expect(chip).toContain('background: var(--panel)');
    expect(chip).toContain('color: var(--plate-accent)');
    expect(css).toContain('body[data-openworld] #openworld-chip:not([hidden]) { display: grid; }');
  });

  it('styles the plate buttons like the redesigned ones: dark steel, light ink, 48 px, 6 px radius, uppercase, amber focus and press', () => {
    const button = rule('#openworld-hud button');
    expect(button).toContain('min-height: var(--target)');
    expect(button).toContain('border-radius: var(--r-button)');
    expect(button).toContain('text-transform: uppercase');
    expect(button).toContain('color: var(--text)');
    expect(rule('#openworld-hud button:focus-visible')).toContain('outline: 2px solid var(--plate-accent)');
    expect(rule('#openworld-hud button:active')).toContain('border-color: var(--plate-accent)');
  });

  it('draws the joystick as a steel ring round an open middle', () => {
    const pad = rule('#joystick');
    expect(pad).toContain('border: 5px solid #8a949c');
    expect(pad).not.toContain('background: var(--panel)');
  });
});

describe('the Open world help (#1252)', () => {
  it('names the keys, and the pad\'s buttons while the pad is in use (body[data-pad])', () => {
    expect(css).toContain('.pad-hint, body[data-pad] .keys-hint { display: none; }');
    expect(css).toContain('body[data-pad] .pad-hint { display: inline; }');
    expect(html).toMatch(/<span class="keys-hint">arrows[^<]*Q E[^<]*<span class="esc-hint">Esc<\/span><span class="touch-hint">the Ship button<\/span> to leave\.<\/span>/);
    expect(html).toMatch(/<span class="pad-hint">left stick to walk, LB RB[^<]*R3[^<]*B to leave\.<\/span>/);
  });
});

describe('the Ship button of the Open world (#1373)', () => {
  it('is a 44 px button at the bottom right on a touch screen, above the peers arrows, out of the joystick half', () => {
    expect(html).toMatch(/<button id="openworld-ship" type="button"[^>]*>Ship<\/button>/);
    expect(css).toContain('@media (pointer: coarse) { body[data-openworld] #openworld-ship { display: grid; } }');
    const ship = rule('#openworld-ship');
    expect(ship).toContain('min-width: var(--target)');
    expect(ship).toContain('min-height: var(--target)');
    expect(ship).toContain('right: 1rem');
    expect(ship).toContain('z-index: 2');
    expect(ship).toContain('display: none');
    expect(css).toContain('@media (pointer: coarse) and (orientation: portrait) { #openworld-hud { bottom: calc(1.5rem + var(--target)); } }');
  });

  it('asks for Esc on a keyboard only; a touch screen reads the Ship button', () => {
    expect(css).toContain('.touch-hint { display: none; }');
    expect(css).toContain('@media (pointer: coarse) { .esc-hint { display: none; } .touch-hint { display: inline; } }');
  });
});

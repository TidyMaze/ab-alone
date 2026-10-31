import { describe, expect, it } from 'vitest';
import css from './ui.css?raw';

// The Open world plate and joystick (#1138): the dark plate with rivets and the amber accent, whatever the system theme.
const rule = (selector: string): string => css.match(new RegExp(`^${selector.replace(/[#.[\]()]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))![1]!;

describe('the Open world HUD plate (#1138)', () => {
  it('is the dark plate with light ink and the amber accent, in both themes', () => {
    const plate = rule('#openworld-hud');
    expect(plate).toContain('--panel: #161a1d');
    expect(plate).toContain('--text: #d8d4c8');
    expect(plate).toContain('--edge: #4a5258');
    expect(plate).toContain('--accent: #ffb000');
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

  it('leaves a chip in the bottom-left corner, a 44 px target in the plate style, only in the world and only while folded', () => {
    const chip = rule('#openworld-chip');
    expect(chip).toContain('min-width: 2.75rem');
    expect(chip).toContain('min-height: 2.75rem');
    expect(chip).toContain('left: 1rem');
    expect(chip).toContain('bottom: 1rem');
    expect(chip).toContain('border: 1px solid #4a5258');
    expect(chip).toContain('color: #ffb000');
    expect(css).toContain('body[data-openworld] #openworld-chip:not([hidden]) { display: grid; }');
  });

  it('styles the plate buttons like the redesigned ones: dark steel, light ink, 48 px, 6 px radius, uppercase, amber focus and press', () => {
    const button = rule('#openworld-hud button');
    expect(button).toContain('min-height: 3rem');
    expect(button).toContain('border-radius: 6px');
    expect(button).toContain('text-transform: uppercase');
    expect(button).toContain('background: #2a3036');
    expect(button).toContain('color: #d8d4c8');
    expect(rule('#openworld-hud button:focus-visible')).toContain('outline: 2px solid #ffb000');
    expect(rule('#openworld-hud button:active')).toContain('border-color: #ffb000');
  });

  it('draws the joystick as a steel ring round an open middle', () => {
    const pad = rule('#joystick');
    expect(pad).toContain('border: 5px solid #8a949c');
    expect(pad).not.toContain('background: var(--panel)');
  });
});

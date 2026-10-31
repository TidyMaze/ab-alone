import { describe, expect, it } from 'vitest';
import css from './ui.css?raw';

// The Open world plate and joystick (#1138): the dark plate with rivets and the amber accent, whatever the system theme.
const rule = (selector: string): string => css.match(new RegExp(`^${selector.replace(/[#.]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))![1]!;

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

  it('draws the joystick as a steel ring round an open middle', () => {
    const pad = rule('#joystick');
    expect(pad).toContain('border: 5px solid #8a949c');
    expect(pad).not.toContain('background: var(--panel)');
  });
});

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
    expect(css).toContain('.pad-hint, .tap-hint, body[data-pad] .keys-hint { display: none; }');
    expect(css).toContain('body[data-pad] .pad-hint { display: inline; }');
    expect(html).toMatch(/<span class="keys-hint">arrows[^<]*Q E[^<]*Esc to leave\.<\/span>/);
    expect(html).toMatch(/<span class="pad-hint">left stick to walk, LB RB[^<]*R3[^<]*B to leave\.<\/span>/);
  });
});

describe('the Hub button of the Open world (#1373)', () => {
  it('is a 44 px button at the bottom right on a touch screen, above the peers arrows, out of the joystick half', () => {
    expect(html).toMatch(/<button id="openworld-ship" type="button"[^>]*>Hub<\/button>/);
    expect(css).toContain('@media (pointer: coarse) { body[data-openworld] #openworld-ship { display: grid; } }');
    const ship = rule('#openworld-ship');
    expect(ship).toContain('min-width: var(--target)');
    expect(ship).toContain('min-height: var(--target)');
    expect(ship).toContain('right: 1rem');
    expect(ship).toContain('z-index: 2');
    expect(ship).toContain('display: none');
    expect(css).toContain('@media (pointer: coarse) and (orientation: portrait) { #openworld-hud { bottom: calc(1.5rem + var(--target)); } }');
  });

  it('names the keys on a keyboard only; a touch screen reads the stick, the tap and the Hub button (#1379)', () => {
    expect(html).toMatch(/<span class="tap-hint">[^<]*stick[^<]*tap[^<]*twist[^<]*the Hub button to leave\.<\/span>/);
    expect(html).not.toMatch(/class="tap-hint">[^<]*\b(arrows|Q E|Esc|click)\b/);
    expect(css).toContain('@media (pointer: coarse) { .keys-hint { display: none; } .tap-hint { display: inline; } }');
    expect(css).toContain('body[data-pad] .tap-hint { display: none; }');
  });
});

describe('the minimap of the Open world (#1410)', () => {
  it('is a canvas in the top right corner under the settings cog, which ignores the pointer', () => {
    const map = rule('#openworld-minimap');
    expect(map).toContain('position: fixed');
    expect(map).toContain('top: calc(16px + 2.75rem + 0.5rem)');
    expect(map).toContain('right: 16px');
    expect(map).toContain('pointer-events: none');
  });
});

describe('the map of the Open world (#1411)', () => {
  it('has a Map button under the minimap, shown only in the world, above the map it opens and closes', () => {
    expect(html).toMatch(/<button id="openworld-map-button" type="button" aria-expanded="false">Map<\/button>/);
    const button = rule('#openworld-map-button');
    expect(button).toContain('display: none');
    expect(button).toContain('top: calc(16px + 2.75rem + 0.5rem + 9rem + 0.5rem)');
    expect(button).toContain('right: 16px');
    expect(button).toContain('min-height: var(--target)');
    expect(button).toContain('z-index: 4');
    expect(button).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).toContain('body[data-openworld] #openworld-map-button { display: grid; }');
  });

  it('covers the screen over the world and its HUD; the box takes the pointer, its canvas does not (the touch stick takes a press on a canvas)', () => {
    const map = rule('#openworld-map');
    expect(map).toContain('position: fixed');
    expect(map).toContain('inset: 0');
    expect(map).toContain('z-index: 3');
    expect(map).toContain('touch-action: none');
    expect(rule('#openworld-map canvas')).toContain('pointer-events: none');
  });

  it('has a caption at the top of the map for the choice of a teleporter, which leaves the pointer to the map (#1412)', () => {
    const note = rule('#openworld-map-note');
    expect(note).toContain('position: absolute');
    expect(note).toContain('pointer-events: none');
    expect(note).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).toContain('#openworld-map-note[hidden] { display: none; }');
  });

  it('is named in the help: M on a keyboard, the Map button on a touch screen, View on a pad', () => {
    expect(html).toMatch(/<span class="keys-hint">[^<]*M for the map[^<]*<\/span>/);
    expect(html).toMatch(/<span class="tap-hint">[^<]*the Map button for the map[^<]*<\/span>/);
    expect(html).toMatch(/<span class="pad-hint">[^<]*View for the map[^<]*<\/span>/);
  });
});

describe('the teleporters of the Open world (#1412)', () => {
  it('has a Teleport button under the Map button, shown only in the world while the hero stands on a teleporter', () => {
    expect(html).toMatch(/<button id="openworld-teleport" type="button" hidden>Teleport<\/button>/);
    const button = rule('#openworld-teleport');
    expect(button).toContain('display: none');
    expect(button).toContain('top: calc(16px + 2.75rem + 0.5rem + 9rem + 0.5rem + var(--target) + 0.5rem)');
    expect(button).toContain('right: 16px');
    expect(button).toContain('min-height: var(--target)');
    expect(button).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).toContain('body[data-openworld] #openworld-teleport:not([hidden]) { display: grid; }');
  });

  it('is named in the help: T on a keyboard, the Teleport button on a touch screen, Y on a pad', () => {
    expect(html).toMatch(/<span class="keys-hint">[^<]*T on a teleporter to teleport[^<]*<\/span>/);
    expect(html).toMatch(/<span class="tap-hint">[^<]*the Teleport button on a teleporter[^<]*<\/span>/);
    expect(html).toMatch(/<span class="pad-hint">[^<]*Y on a teleporter to teleport[^<]*<\/span>/);
  });
});

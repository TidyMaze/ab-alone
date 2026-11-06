import { describe, expect, it } from 'vitest';
import css from './ui.css?raw';
import { EXIT_LABEL, EXIT_NAME, exitOf, type Where } from './exitslot';

// The exit of the dock (#1517, docs/specs/ui.md section "One door grammar"): one control in the first slot, named by where it leads,
// the Open world when the player came from it, else the Hub; the plain table, the Hub itself and an online room have none.

const nowhere: Where = { online: false, world: false, wild: false, lair: false, place: false, mode: false };
const at = (where: Partial<Where>) => exitOf({ ...nowhere, ...where });

describe('exitOf: where the exit of the dock leads', () => {
  it('has none on the plain table, nor in the Hub, the home of the game (neither is a mode)', () => {
    expect(at({})).toBeNull();
  });
  it('leads the Open world to the Hub', () => {
    expect(at({ world: true })).toBe('hub');
  });
  it('leads every other mode to the Hub: a fight, a run, the Trainer, a battle royale, a table of a Hub door', () => {
    expect(at({ mode: true })).toBe('hub');
  });
  it('leads back to the Open world from a lair, a wild fight, and the Hub or the run of a town or a gate', () => {
    expect(at({ lair: true, mode: true })).toBe('world');
    expect(at({ wild: true, mode: true })).toBe('world');
    expect(at({ place: true })).toBe('world');
    expect(at({ place: true, mode: true })).toBe('world');
  });
  it('has none in an online room, which keeps its Lobby and the Hub of its mode menu', () => {
    expect(at({ online: true, mode: true })).toBeNull();
    expect(at({ online: true, lair: true })).toBeNull();
  });
  it('names where it leads: a short label for the dock, a name for the screen readers', () => {
    expect(EXIT_LABEL).toEqual({ world: 'World', hub: 'Hub' });
    expect(EXIT_NAME).toEqual({ world: 'Back to the Open world', hub: 'Back to the hub' });
  });
});

describe('the dock with the exit', () => {
  it('shrinks its gaps held upright so that seven buttons (the exit and Auto-play at a bot\'s table) fit 360 px', () => {
    expect(css).toContain('@media (orientation: portrait) { #dock:has(> #exit:not([hidden])) { gap: clamp(0px, calc((100vw - 350px) / 6), 8px); padding: 4px; } }');
  });
});

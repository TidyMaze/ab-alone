// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { boot, type Game } from './test/harness';

// The thumb dock on the harness (#1032, docs/specs/thumb-dock.md): the Goal sheet opens above the dock, Game modes and
// Settings are one sheet at a time, Esc and a tap outside close the Goal sheet, and Copy diagnostics is the last row of
// the settings list.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Starts the first boss of the Boss fight list: the Goal control shows in the dock from the start of the fight. */
function startFight(game: Game): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(1);
    return a;
  });
  game.openModes();
  byId('boss-fight').click();
  byId('boss-list').querySelector('button')!.click();
}

/** Moves the first move of the fight, so the Goal control is no longer greyed out (it is the goal before the first move). */
function playFirstMove(game: Game): void {
  const legal = game.hook<{ cells: [number, number][]; dir: number }[]>('__legal');
  const mv = legal.find((m) => m.cells.length === 1)!;
  const [q, r] = mv.cells[0]!;
  game.click(q, r);
  const target = game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!;
  game.click(...target.cell);
  expect(game.hook('__plies')).toBe(1);
}

describe('the thumb dock', () => {
  it('the Goal sheet shows the goal above the dock, and a second press closes it', async () => {
    const game = await boot('?bot=off');
    startFight(game);
    playFirstMove(game);
    const goal = byId('boss-goal');
    expect(goal.getAttribute('aria-expanded')).toBe('false');
    expect(byId('goal-sheet').hidden).toBe(true);
    goal.click();
    expect(byId('goal-sheet').hidden).toBe(false);
    expect(byId('goal-sheet').textContent).not.toBe('');
    expect(goal.getAttribute('aria-expanded')).toBe('true');
    goal.click();
    expect(byId('goal-sheet').hidden).toBe(true);
  });

  it('Esc closes the Goal sheet and gives the focus back to Goal', async () => {
    const game = await boot('?bot=off');
    startFight(game);
    playFirstMove(game);
    byId('boss-goal').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(byId('goal-sheet').hidden).toBe(true);
    expect(document.activeElement).toBe(byId('boss-goal'));
  });

  it('Esc with no Goal sheet open leaves the focus where it is', async () => {
    const game = await boot('?bot=off');
    startFight(game);
    playFirstMove(game);
    byId('reset-view').focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.activeElement).toBe(byId('reset-view'));
  });

  it('a tap outside the Goal sheet and its button closes it, a tap inside keeps it open', async () => {
    const game = await boot('?bot=off');
    startFight(game);
    playFirstMove(game);
    byId('boss-goal').click();
    byId('goal-sheet').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(byId('goal-sheet').hidden).toBe(false);
    byId('boss-goal').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(byId('goal-sheet').hidden).toBe(false);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(byId('goal-sheet').hidden).toBe(true);
  });

  it('a tap outside does nothing while no Goal sheet is open', async () => {
    const game = await boot('?bot=off');
    startFight(game);
    playFirstMove(game);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(byId('goal-sheet').hidden).toBe(true);
  });

  it('one sheet at a time: Game modes closes the Goal sheet, Settings closes Game modes, Goal closes both', async () => {
    const game = await boot('?bot=off');
    startFight(game);
    playFirstMove(game);
    byId('boss-goal').click();
    game.openModes();
    expect(byId('goal-sheet').hidden).toBe(true);
    expect(byId('mode-menu').hidden).toBe(false);
    game.openSettings();
    expect(byId('mode-menu').hidden).toBe(true);
    expect(byId('settings-menu').hidden).toBe(false);
    byId('boss-goal').click();
    expect(byId('settings-menu').hidden).toBe(true);
    expect(byId('goal-sheet').hidden).toBe(false);
    game.openModes();
    expect(byId('goal-sheet').hidden).toBe(true);
    expect(byId('mode-menu').hidden).toBe(false);
  });

  it('Copy diagnostics is the last row of the settings list, with its label', async () => {
    const game = await boot('?bot=off');
    game.openSettings();
    const menu = byId('settings-menu');
    const copy = byId('copy-diagnostics');
    expect(copy.parentElement).toBe(menu);
    expect(menu.lastElementChild).toBe(copy);
    expect(copy.getAttribute('aria-label')).toBe('Copy diagnostics');
    expect(copy.querySelector('span')!.textContent).toBe('Copy diagnostics');
  });
});

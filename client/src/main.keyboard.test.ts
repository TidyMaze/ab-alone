// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BLACK_WINS } from '../e2e/end-games';
import type { Axial } from './board';
import { gameFileText } from './gamefile';
import { KEY_DIRS, legalGroups } from './keyboard';
import { SLIDE_MS } from './slide';
import { boot, type Game } from './test/harness';

// The keyboard play of main.ts on the harness (#738): Tab and Shift+Tab, Q W E A S D, Enter and Escape on the canvas.

type Move = { cells: Axial[]; dir: number };
const data = (): DOMStringMap => document.body.dataset;
const canvas = (): HTMLCanvasElement => document.querySelector('canvas')!;
const rings = (game: Game): Axial[] => game.hook<Axial[]>('__rings');
const plies = (game: Game): number => game.hook<number>('__plies');
const keyOf = (dir: number): string => Object.keys(KEY_DIRS).find((k) => KEY_DIRS[k] === dir)!;
/** Presses a key on the canvas and returns whether the page kept its default (focus moves on after Tab). */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  return canvas().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

describe('the keyboard on the board', () => {
  it('makes the canvas a tab stop with a name', async () => {
    await boot('?bot=off');
    expect(canvas().tabIndex).toBe(0);
    expect(canvas().getAttribute('aria-label')).toBe('Abalone board');
  });

  it('Tab selects the groups one by one and announces them, Shift+Tab goes back', async () => {
    const game = await boot('?bot=off');
    expect(press('Tab')).toBe(false);
    expect(rings(game).length).toBeGreaterThan(0);
    expect(game.hud()).toContain('group 1 of');
    const first = rings(game);
    press('Tab');
    expect(game.hud()).toContain('group 2 of');
    expect(rings(game)).not.toEqual(first);
    press('Tab', { shiftKey: true });
    expect(rings(game)).toEqual(first);
  });

  it('Tab past the last group and Shift+Tab before the first leave the board: no selection, focus moves on', async () => {
    const game = await boot('?bot=off');
    expect(press('Tab', { shiftKey: true })).toBe(false); // none selected: the last group
    expect(game.hud()).toContain(`group ${legalGroups(game.hook<Move[]>('__legal')).length} of`);
    expect(press('Tab')).toBe(true);
    expect(rings(game)).toEqual([]);
    press('Tab');
    expect(press('Tab', { shiftKey: true })).toBe(true);
    expect(rings(game)).toEqual([]);
  });

  it('a direction key previews the move as a ghost, Enter plays it', async () => {
    const game = await boot('?bot=off');
    const mv = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
    for (let i = 0; i < 40 && rings(game).join() !== mv.cells[0]!.join(); i++) press('Tab');
    press(keyOf(mv.dir));
    expect(data().ghosts).toBe('1');
    expect(game.hud()).toContain('Enter to play');
    expect(press('Enter')).toBe(false);
    expect(plies(game)).toBe(1);
    expect(rings(game)).toEqual([]);
  });

  it('a direction with no legal move is announced and Enter then plays nothing', async () => {
    const game = await boot('?bot=off');
    press('Tab');
    const open = new Set(game.hook<Move[]>('__legal').filter((m) => m.cells.join() === rings(game).join()).map((m) => m.dir));
    const dir = [0, 1, 2, 3, 4, 5].find((d) => !open.has(d))!;
    press(keyOf(dir));
    expect(game.hud()).toContain('no move');
    press('Enter');
    expect(plies(game)).toBe(0);
  });

  it('Enter with no direction plays nothing', async () => {
    const game = await boot('?bot=off');
    expect(press('Enter')).toBe(true);
    press('Tab');
    expect(press('Enter')).toBe(true);
    expect(plies(game)).toBe(0);
  });

  it('Escape backs out one step: the direction, then the selection, then nothing', async () => {
    const game = await boot('?bot=off');
    expect(press('Escape')).toBe(true);
    press('Tab');
    press('e');
    expect(press('Escape')).toBe(false);
    expect(game.hud()).not.toContain('Enter to play');
    expect(rings(game).length).toBeGreaterThan(0);
    press('Escape');
    expect(rings(game)).toEqual([]);
    expect(game.hud()).toContain('no group selected');
  });

  it('a click on a marble drops the key direction', async () => {
    const game = await boot('?bot=off');
    press('Tab');
    press('e');
    const mv = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    expect(data().ghosts).toBe('0');
  });

  it('drops a key while the marbles slide, and takes the next one once they stopped', async () => {
    const game = await boot('?bot=off');
    press('Tab');
    press(keyOf(game.hook<Move[]>('__legal').find((m) => m.cells.join() === rings(game).join())!.dir));
    press('Enter');
    expect(plies(game)).toBe(1);
    expect(press('Tab')).toBe(true); // the slide runs: no selection
    expect(rings(game)).toEqual([]);
    game.frame(SLIDE_MS);
    expect(press('Tab')).toBe(false);
    expect(rings(game).length).toBeGreaterThan(0);
  });

  it('ignores other keys and shortcuts', async () => {
    const game = await boot('?bot=off');
    expect(press('x')).toBe(true);
    expect(press('Tab', { ctrlKey: true })).toBe(true);
    expect(press('e', { metaKey: true })).toBe(true);
    expect(rings(game)).toEqual([]);
  });

  it('takes no key once the game is over', async () => {
    const game = await boot('?bot=off');
    const input = document.getElementById('import-file') as HTMLInputElement;
    const file = new File([gameFileText({ bot: false, moves: BLACK_WINS })], 'won.json');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await game.settle();
    expect(press('Tab')).toBe(true);
    expect(rings(game)).toEqual([]);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Move } from './board';
import { boot, type Game } from './test/harness';

// What the page shows when something it depends on fails: the bot worker that cannot answer (#736), the wasm or the
// renderer that cannot start (#737).

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const MESSAGE = 'The bot could not answer';

function playFirstMove(game: Game): void {
  const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
  game.click(...move.cells[0]!);
  game.click(...game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
}

describe('a bot worker that cannot answer, #736', () => {
  it('says so in the HUD when the evaluation bar asks', async () => {
    const game = await boot('?nodes=50', { fails: 'worker' });
    await game.settle();
    expect(game.hud()).toContain(MESSAGE);
  });

  it('lets the player go on when the bot turn fails: not thinking for ever, New game in the HUD', async () => {
    const game = await boot('?nodes=50', { fails: 'worker' });
    await game.settle();
    playFirstMove(game);
    expect(byId<HTMLButtonElement>('hint').disabled).toBe(true); // the bot is thinking
    await game.settle();
    expect(game.hud()).toContain(`${MESSAGE}: press New game`);
    expect(byId<HTMLButtonElement>('hint').disabled).toBe(false);
  });

  it('says nothing of a game the player left while the bot failed', async () => {
    const game = await boot('?nodes=50', { fails: 'worker' });
    await game.settle();
    playFirstMove(game);
    byId('new-game').click();
    byId('new-game').click(); // the second press confirms
    await game.settle();
    expect(byId<HTMLButtonElement>('hint').disabled).toBe(false);
    expect(game.hook<number>('__plies')).toBe(0);
  });

  it('turns the hint off when it cannot be asked', async () => {
    const game = await boot('?nodes=50', { fails: 'worker' });
    await game.settle();
    byId('hint').click();
    expect(document.body.dataset.hint).toBe('asking');
    await game.settle();
    expect(document.body.dataset.hint).toBe('off');
    expect(game.hud()).toContain(MESSAGE);
  });
});

describe('a start that fails, #737', () => {
  it.each([
    ['wasm', 'wasm fetch failed'],
    ['renderer', 'no GPU'],
  ] as const)('shows the %s failure with a Reload button instead of a blank page', async (fails, reason) => {
    await expect(boot('?bot=off', { fails })).rejects.toThrow(reason);
    const box = byId('boot-error');
    expect(box.hidden).toBe(false);
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.textContent).toContain(`The game could not start: ${reason}`);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    byId('boot-reload').click();
    expect(reload).toHaveBeenCalledOnce();
  });
});

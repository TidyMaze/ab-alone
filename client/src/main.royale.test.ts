// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// The offline battle royale on the harness (#502): Battle royale in the mode menu starts 1 player against 5 bots on
// the radius 8 arena, at the Furnace. The player picks an order on the arena and locks it, or holds; the round
// resolves and the HUD plate shows the reveal log in initiative order, a fizzle marked, and the next round's
// initiative before its reveal. A boss fight or Play online leaves it.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const button = (id: string): HTMLButtonElement => byId<HTMLButtonElement>(id);
const items = (selector: string): string[] => [...byId('hud').querySelectorAll(selector)].map((li) => li.textContent!);
const turn = (): string => byId('hud').querySelector('.turn')!.textContent!;
const canvas = (): HTMLCanvasElement => document.querySelector('canvas')!;
function tap(game: Game, q: number, r: number): void {
  const { x, y } = game.hook<{ x: number; y: number }>('__cellToScreen', q, r);
  for (const type of ['pointerdown', 'pointerup'])
    canvas().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
}
async function royale(): Promise<Game> {
  const game = await boot('?bot=off');
  game.openModes();
  button('battle-royale').click();
  return game;
}
// Seat 0 orders (-6, 3) E, a marble of Bot 1: it fizzles.
const FIZZLE = [0, 1, 0, -6, 3, 0, 0, 0, 0];

describe('main.ts, the offline battle royale (#502)', () => {
  it('Battle royale starts round 1 on the arena at the Furnace, its initiative shown, Lock off until an order', async () => {
    const game = await royale();
    expect(byId('mode-menu').hidden).toBe(true); // picking a mode closes the menu
    expect(document.body.dataset.royale).toBe('1');
    expect(document.body.dataset.deck).toBe('furnace');
    expect(turn()).toBe('Battle royale · Round 1');
    expect(items('.initiative li')).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5']);
    expect(byId('hud').textContent).toContain('Your order: none');
    expect(items('.reveal li')).toEqual([]);
    expect(game.hook<{ drawn: boolean }>('__frame').drawn).toBe(false); // the radius 4 frame is put away
    expect(button('royale-lock').hidden).toBe(false);
    expect(button('royale-lock').disabled).toBe(true);
    expect(button('royale-hold').hidden).toBe(false);
    expect(button('royale-hold').disabled).toBe(false);
    for (const id of ['new-game', 'boss-retry', 'hint', 'eval', 'setting-export-game', 'setting-import-game'])
      expect(byId(id).hidden, id).toBe(true);
  });

  it('a press on a marble of the player selects it, a press on a target picks the order, Lock plays the round', async () => {
    const game = await royale();
    tap(game, -6, 3); // a marble of Bot 1: nothing
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
    tap(game, -4, 8); // the player's marble is selected
    expect(game.hook<Axial[]>('__rings')).toEqual([[-4, 8]]);
    tap(game, 0, 0); // no target there: nothing changes
    expect(byId('hud').textContent).toContain('Your order: none');
    game.click(-4, 8);
    expect(game.hook<Axial[]>('__rings')).toEqual([]); // a second press lets it go
    game.click(-2, 6);
    expect(game.hook<{ cell: Axial }[]>('__targets').map((t) => t.cell)).toContainEqual([-2, 5]);
    const { x, y } = game.hook<{ x: number; y: number }>('__cellToScreen', -2, 5);
    canvas().dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 2, bubbles: true }));
    expect(document.body.dataset.ghosts).toBe('0'); // no ghost over the arena
    game.click(-2, 5); // (-2, 6) NW
    expect(byId('hud').textContent).toContain('Your order: 1 marble NW');
    expect(button('royale-lock').disabled).toBe(false);
    game.click(-3, 6); // a new selection drops the order picked
    expect(game.hook<Axial[]>('__rings')).toEqual([[-2, 6], [-3, 6]]);
    expect(byId('hud').textContent).toContain('Your order: none');
    game.click(-3, 6);
    game.click(-2, 5);
    button('royale-lock').click();
    expect(document.body.dataset.royale).toBe('2');
    expect(turn()).toBe('Battle royale · Round 2');
    expect(items('.initiative li')).toEqual(['Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'You']);
    expect(items('.reveal li')[0]).toBe('You: moved');
    expect(items('.reveal li').map((t) => t.split(':')[0])).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5']);
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
    expect(byId('hud').textContent).toContain('Your order: none');
    expect(button('royale-lock').disabled).toBe(true);
  });

  it('Hold plays the round with no order of the player', async () => {
    await royale();
    button('royale-hold').click();
    expect(items('.reveal li')[0]).toBe('You: held');
    expect(turn()).toBe('Battle royale · Round 2');
  });

  it('a royale game file loads through the hook, and the reveal log marks the fizzled order', async () => {
    const game = await boot('?bot=off');
    game.hook('__royale', { seed: 7, rounds: [FIZZLE] });
    expect(turn()).toBe('Battle royale · Round 2');
    const fizzled = byId('hud').querySelector('.reveal li.fizzled')!;
    expect(fizzled.textContent).toBe('You: fizzled');
  });

  it('a finished game takes no more round: Lock and Hold are off', async () => {
    const game = await boot('?bot=off');
    game.hook('__royale', { seed: 7, rounds: [] });
    // Every game ends by round 52, when the centre cell goes void (rules.md 10.4).
    for (let round = 0; round < 60 && !button('royale-hold').disabled; round++) button('royale-hold').click();
    expect(button('royale-hold').disabled).toBe(true);
    expect(button('royale-lock').disabled).toBe(true);
  });

  it('a boss fight leaves the battle royale: the board and its frame come back', async () => {
    const game = await royale();
    game.openModes();
    button('boss-fight').click();
    [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Echo')!.click();
    expect(document.body.dataset.royale).toBeUndefined();
    expect(button('royale-lock').hidden).toBe(true);
    expect(button('royale-hold').hidden).toBe(true);
    expect(game.hook<{ drawn: boolean }>('__frame').drawn).toBe(true);
    expect(turn()).not.toContain('Battle royale');
    game.click(0, 2); // the board takes the clicks again
    expect(game.hook<Axial[]>('__rings')).toEqual([[0, 2]]);
  });

  it('Ship leaves it for the hub, and Battle royale leaves the hub', async () => {
    const game = await royale();
    game.openModes();
    button('ship').click();
    expect(document.body.dataset.royale).toBeUndefined();
    expect(document.body.dataset.hub).toBeDefined();
    expect(button('royale-hold').hidden).toBe(true);
    game.openModes();
    button('battle-royale').click();
    expect(document.body.dataset.hub).toBeUndefined();
    expect(turn()).toBe('Battle royale · Round 1');
  });

  it('Play online leaves it too, and Battle royale does nothing while online', async () => {
    const game = await royale();
    game.openModes();
    button('play-online').click();
    await game.settle();
    expect(document.body.dataset.royale).toBeUndefined();
    game.openModes();
    button('battle-royale').click();
    expect(document.body.dataset.royale).toBeUndefined();
  });
});

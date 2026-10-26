// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// The offline battle royale on the harness (#502): Battle royale in the mode menu starts 1 player against 5 bots on
// the radius 8 arena, at the Furnace. The player presses a target on the arena, which locks the order, or holds; the
// round resolves and the HUD plate shows the reveal log in initiative order, a fizzle marked, and the next round's
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
// Everyone holds 12 rounds: ring 8, its 48 cells, cracks at the end of round 12 and goes void at the end of round 13.
const CRACKED = { seed: 7, rounds: Array.from({ length: 12 }, () => []) };
// The player walks its 4 columns NW to radius 5 or less in 11 rounds while the bots hold on the rim: the void of ring 6
// at the end of round 25 takes the bots' last marbles together, the player is first (the same file as e2e/royale.spec.ts).
const NW = (...cells: Axial[]): number[] => [0, cells.length, 4, ...[...cells, [0, 0], [0, 0]].slice(0, 3).flat()];
const column = (cells: Axial[], steps: number): number[][] =>
  Array.from({ length: steps }, (_, s) => NW(...cells.map(([q, r]): Axial => [q, r - s])));
const END = {
  seed: 7,
  rounds: [
    ...column([[-4, 8], [-4, 7], [-4, 6]], 3),
    ...column([[-3, 8], [-3, 7], [-3, 6]], 3),
    ...column([[-5, 8], [-5, 7]], 3),
    ...column([[-2, 7], [-2, 6]], 2),
    ...Array.from({ length: 14 }, () => []),
  ],
};

describe('main.ts, the offline battle royale (#502)', () => {
  it('Battle royale starts round 1 on the arena at the Furnace, its initiative shown, Hold on and no Lock order (#611)', async () => {
    const game = await royale();
    expect(byId('mode-menu').hidden).toBe(true); // picking a mode closes the menu
    expect(document.body.dataset.royale).toBe('1');
    expect(document.body.dataset.deck).toBe('furnace');
    expect(turn()).toBe('Battle royale · Round 1');
    expect(items('.initiative li')).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5']);
    expect(byId('hud').textContent).not.toContain('Your order');
    expect(items('.reveal li')).toEqual([]);
    expect(game.hook<{ drawn: boolean }>('__frame').drawn).toBe(false); // the radius 4 frame is put away
    expect(byId('royale-lock')).toBeNull();
    expect(button('royale-hold').hidden).toBe(false);
    expect(button('royale-hold').disabled).toBe(false);
    for (const id of ['new-game', 'boss-retry', 'hint', 'eval', 'setting-export-game', 'setting-import-game'])
      expect(byId(id).hidden, id).toBe(true);
  });

  it('a press on a marble of the player selects it, a press on a target locks the order and plays the round (#611)', async () => {
    const game = await royale();
    tap(game, -6, 3); // a marble of Bot 1: nothing
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
    tap(game, -4, 8); // the player's marble is selected
    expect(game.hook<Axial[]>('__rings')).toEqual([[-4, 8]]);
    tap(game, 0, 0); // no target there: nothing changes
    expect(turn()).toBe('Battle royale · Round 1');
    game.click(-4, 8);
    expect(game.hook<Axial[]>('__rings')).toEqual([]); // a second press lets it go
    game.click(-2, 6);
    expect(game.hook<{ cell: Axial }[]>('__targets').map((t) => t.cell)).toContainEqual([-2, 5]);
    const { x, y } = game.hook<{ x: number; y: number }>('__cellToScreen', -2, 5);
    canvas().dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 2, bubbles: true }));
    expect(document.body.dataset.ghosts).toBe('0'); // no ghost over the arena
    game.click(-2, 5); // (-2, 6) NW: the round resolves at once
    expect(document.body.dataset.royale).toBe('2');
    expect(turn()).toBe('Battle royale · Round 2');
    expect(items('.initiative li')).toEqual(['Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'You']);
    expect(items('.reveal li')[0]).toBe('You: moved');
    expect(items('.reveal li').map((t) => t.split(':')[0])).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5']);
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
  });

  it("each seat's marbles on the arena wear the seat's glyph, a picked one too (#558)", async () => {
    const game = await royale();
    expect(game.hook<number[]>('__seatGlyphs')).toEqual([10, 10, 10, 10, 10, 10]);
    expect(byId('hud').querySelectorAll('.initiative .seat svg')).toHaveLength(6);
    tap(game, -4, 8);
    expect(game.hook<number[]>('__seatGlyphs')).toEqual([10, 10, 10, 10, 10, 10]);
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

  it('a finished game takes no more round: Hold is off', async () => {
    const game = await boot('?bot=off');
    game.hook('__royale', { seed: 7, rounds: [] });
    // Every game ends by round 52, when the centre cell goes void (rules.md 10.4).
    for (let round = 0; round < 60 && !button('royale-hold').disabled; round++) button('royale-hold').click();
    expect(button('royale-hold').disabled).toBe(true);
  });

  it('a cracked ring glows with the crack decal and its countdown a round before it goes void, then vanishes (#503)', async () => {
    const game = await boot('?bot=off');
    game.hook('__royale', CRACKED);
    expect(turn()).toBe('Battle royale · Round 13');
    expect(document.body.dataset.cracks).toBe('48');
    expect(document.body.dataset.vanished).toBe('0');
    expect(game.hook<Axial[]>('__crackDecals')).toHaveLength(48);
    expect(game.hook<Axial[]>('__crackDecals')).toContainEqual([0, 8]);
    expect(byId('hud').querySelector('.breach')!.textContent).toBe('Breach: 48 cells void in 1 round');
    button('royale-hold').click();
    expect(turn()).toBe('Battle royale · Round 14');
    expect(document.body.dataset.cracks).toBe('0');
    expect(document.body.dataset.vanished).toBe('48');
    expect(game.hook<Axial[]>('__crackDecals')).toEqual([]);
    expect(byId('hud').querySelector('.breach')).toBeNull();
  });

  it('without the crack decal, the glow, the ticks and the plate line still warn (#503)', async () => {
    const game = await boot('?bot=off', { missing: ['crack-decal.png'] });
    game.hook('__royale', CRACKED);
    expect(document.body.dataset.cracks).toBe('48');
    expect(game.hook<Axial[]>('__crackDecals')).toEqual([]);
    expect(byId('hud').querySelector('.breach')!.textContent).toBe('Breach: 48 cells void in 1 round');
  });

  it('a seat out is greyed out on the plate, and the end shows the places and points, a loss lit as one (#503)', async () => {
    const game = await boot('?bot=off');
    game.hook('__royale', { seed: 7, rounds: [] });
    // The player holds on the rim while the bots play: its last marbles go void at the end of round 25.
    for (let round = 0; round < 25; round++) button('royale-hold').click();
    expect(items('.initiative li.out')).toEqual(['You']);
    expect(document.body.dataset.over).toBeUndefined();
    for (let round = 0; round < 60 && !button('royale-hold').disabled; round++) button('royale-hold').click();
    expect(turn()).toBe('You place 6th');
    expect(document.body.dataset.over).toBe('loss');
    expect(items('.placement li')).toHaveLength(6);
    expect(items('.placement li').at(-1)).toBe('6th You · 0 points');
  });

  it('an end position loads: the banner names the winner, the places and points, Hold off (#503)', async () => {
    const game = await boot('?bot=off');
    game.hook('__royale', END);
    expect(turn()).toBe('You win');
    expect(document.body.dataset.over).toBe('win');
    expect(byId('hud').querySelector('.end')!.textContent).toBe('10 points. The books balance.');
    expect(items('.placement li')).toEqual([
      '1st You · 10 points',
      '2nd Bot 1 · 6 points',
      '2nd Bot 2 · 6 points',
      '2nd Bot 3 · 6 points',
      '2nd Bot 4 · 6 points',
      '2nd Bot 5 · 6 points',
    ]);
    expect(button('royale-hold').disabled).toBe(true);
    game.click(-2, 4); // a marble of the player, then its NW target: no round after the end (#611)
    game.click(-2, 3);
    expect(game.hook<Axial[]>('__rings')).toEqual([]);
    expect(turn()).toBe('You win');
    game.openModes();
    button('ship').click();
    expect(document.body.dataset.over).toBeUndefined(); // no end light over the hub
  });

  it('a boss fight leaves the battle royale: the board and its frame come back', async () => {
    const game = await royale();
    game.openModes();
    button('boss-fight').click();
    [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Echo')!.click();
    expect(document.body.dataset.royale).toBeUndefined();
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

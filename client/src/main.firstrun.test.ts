// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { encodeMove } from './board';
import { COACH, COLD_OPEN, FIRST_FIGHT, FIRST_PUSH } from './firstrun';
import { boot, type Game } from './test/harness';

// The first run on main.ts (#1521, #1523, docs/specs/ui.md section 4.7): a fresh profile gets the cold open, a scripted fight
// ended by its first ejection, then the Hub with The Echo as the next goal, instead of the five pages of the guide.

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const run = (): string | undefined => document.body.dataset.firstrun;
const key = (target: EventTarget, k: string, shiftKey = false): boolean =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
const done = (): string | null => localStorage.getItem('ab-alone.firstrun');
/** Rolls the three White marbles of the scripted push into the lone Black marble. */
function push(game: Game): void {
  for (const [q, r] of FIRST_PUSH.cells) game.click(q, r);
  game.click(-2, -2);
}

function plugPad(game: Game): (button: number) => void {
  let pads: unknown[] = [];
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
  const hold = (buttons: number[]): void => {
    const pressed = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
    pads = [{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: pressed }];
    game.frame();
  };
  return (button) => {
    hold([button]);
    hold([]);
  };
}

describe('the cold open', () => {
  it('opens first on a fresh profile with no query, three lines of story, no guide, and is marked done at once', async () => {
    await boot('/', { webdriver: false, storage: { 'ab-alone.firstwin': '1' } }); // a player who won, the lock off (#1665)
    expect(byId('coldopen').hidden).toBe(false);
    expect(byId('coldopen').getAttribute('role')).toBe('dialog');
    expect(byId('coldopen-title').textContent).toBe(COLD_OPEN.title);
    expect([...byId('coldopen-text').querySelectorAll('p')].map((p) => p.textContent)).toEqual(COLD_OPEN.lines);
    expect(document.activeElement).toBe(byId('coldopen-begin'));
    expect(byId('guide').hidden).toBe(true);
    expect(run()).toBe('open');
    expect(done()).toBe('done'); // it plays once, even if the tab closes here
    expect(document.body.dataset.hub).toBeUndefined();
  });

  it('is asked for by ?firstrun under automation, and by nothing else there', async () => {
    await boot('?firstrun');
    expect(byId('coldopen').hidden).toBe(false);
    await boot('?bot=off');
    expect(byId('coldopen').hidden).toBe(true);
    expect(run()).toBeUndefined();
    await boot('/'); // a hook-driven boot of the main URL keeps its Hub (#602)
    expect(byId('coldopen').hidden).toBe(true);
    expect(document.body.dataset.hub).toBe('mess 0,0');
  });

  it('does not open for a returning player: a boss beaten; the Hub opens as before. A guide-only profile lands locked, on the board (#1665)', async () => {
    await boot('/', { webdriver: false, storage: { 'ab-alone.guide': 'seen' } });
    expect(byId('coldopen').hidden).toBe(true);
    expect(document.body.dataset.hub).toBeUndefined();
    expect(document.body.dataset.unlocked).toBe('0');
    expect(done()).toBeNull();
    await boot('/', { webdriver: false, storage: { 'ab-alone.progress': JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0], beaten: ['echo'] }) } });
    expect(byId('coldopen').hidden).toBe(true);
    expect(document.body.dataset.hub).toBe('mess 0,0');
    await boot('/', { webdriver: false, storage: { 'ab-alone.firstrun': 'done' } });
    expect(byId('coldopen').hidden).toBe(true);
  });

  it('is skipped by Skip or Escape, which open the Hub; the keys pressed in it never reach the game, and Tab keeps the focus in it', async () => {
    await boot('?firstrun');
    const skip = byId('coldopen-skip');
    skip.focus();
    let reachedByLetter = false;
    addEventListener('keydown', () => (reachedByLetter = true), { once: true });
    key(skip, 'q'); // any other key stays in it too
    expect(reachedByLetter).toBe(false);
    expect(key(skip, 'Tab', true)).toBe(false); // the first stop wraps to the last
    expect(document.activeElement).toBe(byId('coldopen-begin'));
    expect(key(byId('coldopen-begin'), 'Tab')).toBe(false);
    expect(document.activeElement).toBe(skip);
    skip.click();
    expect(byId('coldopen').hidden).toBe(true);
    expect(run()).toBeUndefined();
    expect(document.body.dataset.hub).toBe('mess 0,0');
    await boot('?firstrun');
    let reached = false;
    addEventListener('keydown', () => (reached = true), { once: true });
    expect(key(byId('coldopen'), 'Escape')).toBe(false);
    expect(reached).toBe(false);
    expect(document.body.dataset.hub).toBe('mess 0,0');
  });
});

describe('the cold open on a pad', () => {
  it('is walked by the D-pad and LB RB inside it, A presses, Start leaves the settings shut, B skips to the Hub', async () => {
    const game = await boot('?firstrun');
    const tap = plugPad(game);
    tap(15); // D-pad right: the next stop after Begin wraps to Skip
    expect(document.activeElement).toBe(byId('coldopen-skip'));
    tap(4); // LB: Shift+Tab, back to Begin
    expect(document.activeElement).toBe(byId('coldopen-begin'));
    tap(9); // Start: the settings stay shut under the cold open
    expect(byId('settings-menu').hidden).toBe(true);
    tap(1); // B
    expect(document.body.dataset.hub).toBe('mess 0,0');
    Reflect.deleteProperty(navigator, 'getGamepads');
  });
});

describe('the scripted fight', () => {
  it('begins on the fixed board with the push shown as the hint, and the first Tally line explained once', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    expect(byId('coldopen').hidden).toBe(true);
    expect(run()).toBe('fight');
    expect(game.hook('__plies')).toBe(FIRST_FIGHT.length);
    expect(game.hook<number[]>('__hint')).toEqual(encodeMove(FIRST_PUSH));
    expect(byId('coach').hidden).toBe(false);
    expect(byId('coach-step').textContent).toBe(COACH.push);
    expect(byId('coach-hub').hidden).toBe(true);
    expect(game.hud()).toContain('Mess: one seat filled. The other is counted.'); // the HUD line, as at the start of a match
    expect(byId('hud').querySelector('.tally-note')!.textContent).toBe(COACH.tally); // explained once, under it
    expect(byId('hud').textContent).toContain('White to move');
  });

  it('ends on the first ejection: the bot does not reply, Tally says so, and To the Hub opens the Hub with The Echo as the goal', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    push(game);
    game.frame(5000); // the slide ends
    await game.settle();
    expect(game.hook('__plies')).toBe(FIRST_FIGHT.length + 1); // the bot never answered
    expect(run()).toBe('done');
    expect(byId('coach-step').textContent).toBe(COACH.done);
    expect(byId('coach-step').textContent).toContain('Another one over the edge.'); // Tally's eject line (#1649)
    expect(byId('hud').querySelector('.tally-note')).toBeNull();
    expect(byId('coach-hub').hidden).toBe(false);
    expect(byId('coach-skip').hidden).toBe(true);
    expect(game.hud()).toContain('White ejected 1/6');
    byId('coach-hub').click();
    expect(byId('coach').hidden).toBe(true);
    expect(run()).toBeUndefined();
    expect(document.body.dataset.hub).toBe('mess 0,0');
    const goal = document.querySelector('#hub-rail li[data-goal]')!;
    expect(goal.getAttribute('data-deck')).toBe('mess');
    expect(goal.textContent).toContain('Seat: The Echo waits');
    expect(document.querySelector('#hub-rail p.goal')!.textContent).toBe('Next goal: Beat The Echo on the Mess deck.');
    expect(document.querySelectorAll('#hub-labels .hub-label[data-goal]')).toHaveLength(1);
    expect(document.querySelector('#hub-labels [data-goal]')!.getAttribute('data-kind')).toBe('boss');
  });

  it('never saves the scripted game as the player\'s: a reload after it lands on the Hub, not on that board', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?firstrun', { indexedDB });
    byId('coldopen-begin').click();
    push(game);
    game.frame(5000);
    await game.settle();
    const again = await boot('/', { indexedDB, storage: { 'ab-alone.firstrun': 'done' } });
    expect(again.hook('__plies')).toBe(0);
    expect(document.body.dataset.hub).toBe('mess 0,0');
  });

  it('can be skipped from the fight, to the Hub, with the scripted game left unsaved', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    byId('coach-skip').click();
    expect(byId('coach').hidden).toBe(true);
    expect(run()).toBeUndefined();
    expect(document.body.dataset.hub).toBe('mess 0,0');
    await game.settle();
  });

  it('goes on after another move than the scripted push: the bot answers, and the first ejection still ends it', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.click(0, 2); // a marble the player moves instead
    game.click(0, 1);
    game.frame(5000);
    for (let i = 0; i < 50 && game.hook<number>('__plies') < FIRST_FIGHT.length + 2; i++) await game.settle();
    expect(game.hook('__plies')).toBe(FIRST_FIGHT.length + 2); // the bot replied
    expect(run()).toBe('fight');
    expect(game.hook<number[] | null>('__hint')).toBeNull(); // the shown push was for the other position
  });

  it('shows the next goal of the path to a player who beat a boss: a first run, then the next deck\'s boss (#1524)', async () => {
    const progress = JSON.stringify({ version: 1, deck: 'cargo', cell: [0, 0], beaten: ['echo'] }); // the marble on the deck of the goal room
    await boot('/', { storage: { 'ab-alone.progress': progress } });
    expect(document.querySelector('#hub-rail p.goal')!.textContent).toBe('Next goal: Start a rogue-lite run on the Cargo deck.');
    expect(document.querySelector('#hub-rail li[data-goal]')!.getAttribute('data-deck')).toBe('cargo');
    expect(document.querySelector('#hub-labels [data-goal]')!.getAttribute('data-kind')).toBe('run');
    await boot('/', { storage: { 'ab-alone.progress': progress, 'ab-alone.roguelite': '1' } }); // a run was played
    expect(document.querySelector('#hub-rail p.goal')!.textContent).toBe('Next goal: Beat The Hull on the Cargo deck.');
    expect(document.querySelector('#hub-labels [data-goal]')!.getAttribute('data-kind')).toBe('boss');
  });
});

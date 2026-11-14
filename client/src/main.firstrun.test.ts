// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { BLACK_WINS, WHITE_WINS } from '../e2e/end-games';
import { DIRECTIONS, encodeMove, parseMoves, type Move } from './board';
import { COACH, COLD_OPEN, PRACTICE_BOT, isBroadside, stepLine } from './firstrun';
import { boot, type Game } from './test/harness';

// The bot's move can be fixed by a test (`fixed`), else it is the real first bot's.
const fixed: { move: ((flat: ArrayLike<number>) => number[]) | null } = vi.hoisted(() => ({ move: null }));
vi.mock('./firstbot', async (actual) => {
  const real = await actual<typeof import('./firstbot')>();
  return { ...real, firstBotMove: (flat: ArrayLike<number>, seed: number) => (fixed.move ? fixed.move(flat) : real.firstBotMove(flat, seed)) };
});

// The first run on main.ts (#1521, #1523, docs/specs/ui.md section 4.7): a fresh profile gets the cold open, a scripted fight
// ended by its first ejection, then the Hub with The Echo as the next goal, instead of the five pages of the guide.

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
const run = (): string | undefined => document.body.dataset.firstrun;
const key = (target: EventTarget, k: string, shiftKey = false): boolean =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
const done = (): string | null => localStorage.getItem('ab-alone.firstrun');
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

/** Six plies from the standard start (the old scripted fight): White rolls three up the left edge, Black walks a marble to the rim. White is then to push (-2,-1), (-2,0), (-2,1) into (-2,-2). */
const PUSH_POSITION: Move[] = [
  { cells: [[-2, 2], [-2, 3], [-2, 4]], dir: 4 },
  { cells: [[0, -2]], dir: 1 },
  { cells: [[-2, 1], [-2, 2], [-2, 3]], dir: 4 },
  { cells: [[-1, -2]], dir: 1 },
  { cells: [[-2, 0], [-2, 1], [-2, 2]], dir: 4 },
  { cells: [[2, -2]], dir: 0 },
];
const PUSH_CELLS: [number, number][] = [[-2, -1], [-2, 0], [-2, 1]];

/** Lets the bot's reply come: the slide ends, the tasks run. */
async function reply(game: Game, plies: number): Promise<void> {
  game.frame(5000);
  for (let i = 0; i < 50 && game.hook<number>('__plies') < plies; i++) await game.settle();
  game.frame(5000);
}
/** Plays a legal move of the player that `wanted` picks, by clicks: its marbles, then the cell next to the first. */
function play(game: Game, wanted: (move: Move) => boolean): void {
  const move = game.hook<Move[]>('__legal').find(wanted)!;
  for (const [q, r] of move.cells) game.click(q, r);
  const [dq, dr] = DIRECTIONS[move.dir]!;
  game.click(move.cells[0]![0] + dq, move.cells[0]![1] + dr);
}
const plate = (): string => byId('coach-step').textContent!;

describe('the first match (#1663)', () => {
  it('begins on the standard board, nothing played, with the coach at its first step and the first Tally line explained once', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    expect(byId('coldopen').hidden).toBe(true);
    expect(run()).toBe('match');
    expect(game.hook('__plies')).toBe(0);
    expect(byId('coach').hidden).toBe(false);
    expect(plate()).toBe(stepLine('select', false));
    expect(byId('coach-hub').hidden).toBe(true);
    expect(byId('coach-skip').hidden).toBe(false);
    expect(game.hud()).toContain('Mess: one seat filled. The other is counted.');
    expect(byId('hud').querySelector('.tally-note')!.textContent).toBe(COACH.tally);
    expect(byId('hud').textContent).toContain('White to move');
  });

  it('names the tap on a touch screen', async () => {
    await boot('?firstrun', { touch: true });
    byId('coldopen-begin').click();
    expect(plate()).toBe(stepLine('select', true));
    expect(plate()).toMatch(/^Tap /);
  });

  it('waits for each real input: a selection, a move, a broadside, then the push step; the weak bot answers each move', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.click(0, 2);
    expect(plate()).toBe(stepLine('move', false));
    game.click(0, 1);
    expect(game.hook('__plies')).toBe(1);
    expect(plate()).toBe(stepLine('broadside', false));
    await reply(game, 2);
    expect(game.hook('__plies')).toBe(2); // the bot replied
    play(game, (move) => isBroadside(move));
    expect(plate()).toBe(stepLine('push', false));
    expect(run()).toBe('match');
  });

  it('labels the bot a practice bot in the HUD, with no rating', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    expect(game.hud()).toContain(PRACTICE_BOT);
    expect(game.hud()).not.toMatch(/Easy|~\d/);
    expect(document.body.dataset.botRating).toBeUndefined();
  });

  it('after 10 moves without a push, the push step comes back, with a push as the hint when the position has one', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    for (let i = 0; i < 10; i++) {
      expect(plate()).not.toBe(stepLine('push', false)); // the plate says push only when the tenth is played
      play(game, (move) => move.cells.length === 1);
      await reply(game, game.hook<number>('__plies') + 1);
    }
    expect(plate()).toBe(stepLine('push', false));
    expect(game.hook('__hint')).toBeNull(); // no push to show in this position
  });

  it('shows the push as the hint when a push is there: the bot is made to leave the marble on the rim', async () => {
    let n = 0;
    fixed.move = (flat) => {
      const moves = parseMoves(flat);
      const others = moves.flatMap((move, i) => (move.cells.length === 1 && !(move.cells[0]![0] === -2 && move.cells[0]![1] === -2) ? [i] : [])); // never the lone marble: no repetition either
      const j = others[(n++ * 7) % others.length]!;
      return Array.from(flat).slice(j * 8, j * 8 + 8);
    };
    try {
      const game = await boot('?firstrun');
      byId('coldopen-begin').click();
      game.hook('__playMoves', PUSH_POSITION.map(encodeMove));
      for (let i = 0; i < 20 && plate() !== stepLine('push', false); i++) {
        const singles = game.hook<Move[]>('__legal').filter((move) => move.cells.length === 1 && move.cells[0]![0] > 0);
        const pick = JSON.stringify(singles[(i * 5) % singles.length]); // a different marble each time: no repetition
        play(game, (move) => JSON.stringify(move) === pick);
        await reply(game, game.hook<number>('__plies') + 1);
      }
      expect(plate()).toBe(stepLine('push', false));
      expect(game.hook<number[] | null>('__hint')).toEqual(encodeMove({ cells: [[-2, -1], [-2, 0]], dir: 4 })); // the first push of the legal moves
    } finally {
      fixed.move = null;
    }
  });

  it('says why a move is refused, in the HUD, for the whole match', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.click(0, 2);
    game.click(3, -3); // far from it
    expect(game.hud()).toContain(COACH.refused);
    expect(plate()).toBe(stepLine('move', false)); // the step waits
  });

  it('ends the lesson on the first push, the plate fades after the next move, and the match goes on', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.hook('__playMoves', PUSH_POSITION.map(encodeMove));
    for (const [q, r] of PUSH_CELLS) game.click(q, r);
    game.click(-2, -2);
    game.frame(5000);
    expect(game.hud()).toContain('White ejected 1/6');
    expect(plate()).toBe(stepLine('free', false));
    await reply(game, PUSH_POSITION.length + 2);
    play(game, (move) => move.cells.length === 1);
    expect(byId('coach').hidden).toBe(true);
    expect(run()).toBe('match');
  });

  it('is never saved as the player\'s game: a reload after a move lands where a returning player lands, not on that board', async () => {
    const indexedDB = new IDBFactory();
    const game = await boot('?firstrun', { indexedDB });
    byId('coldopen-begin').click();
    game.click(0, 2);
    game.click(0, 1);
    await reply(game, 2);
    const again = await boot('/', { indexedDB, storage: { 'ab-alone.firstrun': 'done' } });
    expect(again.hook('__plies')).toBe(0);
    expect(document.body.dataset.hub).toBe('mess 0,0');
  });

  it('a win, for a player the lock is off for, says so and opens the way to the Hub with The Echo as the goal', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.hook('__playMoves', BLACK_WINS);
    expect(document.body.dataset.over).toBe('win');
    expect(plate()).toBe(COACH.won);
    expect(byId('coach').hidden).toBe(false);
    expect(byId('coach-skip').hidden).toBe(true);
    expect(byId('coach-hub').hidden).toBe(false);
    byId('coach-hub').click();
    expect(byId('coach').hidden).toBe(true);
    expect(run()).toBeUndefined();
    expect(document.body.dataset.hub).toBe('mess 0,0');
    expect(document.querySelector('#hub-rail li[data-goal]')!.textContent).toContain('Seat: The Echo waits');
  });

  it('a loss says New game starts it again, and opens no way to the Hub', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.hook('__playMoves', WHITE_WINS);
    expect(document.body.dataset.over).toBe('loss');
    expect(plate()).toBe(COACH.lost);
    expect(byId('coach').hidden).toBe(false);
    expect(byId('coach-hub').hidden).toBe(true);
    expect(byId('coach-skip').hidden).toBe(true);
  });

  it('a draw says so, apart from a loss, and opens no way to the Hub', async () => {
    const { Engine } = await import('edgefall-wasm');
    const engine = new Engine();
    const moves: number[][] = [];
    while (engine.status() === 0) {
      const record = encodeMove(parseMoves(engine.legal_moves())[0]!);
      engine.play(Int32Array.from(record));
      moves.push(record);
    }
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    game.hook('__playMoves', moves);
    expect(document.body.dataset.over).toBe('draw');
    expect(plate()).toBe(COACH.draw);
    expect(byId('coach-hub').hidden).toBe(true);
  });

  it('can be skipped from the match, to the Hub, with the game left unsaved', async () => {
    const game = await boot('?firstrun');
    byId('coldopen-begin').click();
    byId('coach-skip').click();
    expect(byId('coach').hidden).toBe(true);
    expect(run()).toBeUndefined();
    expect(document.body.dataset.hub).toBe('mess 0,0');
    await game.settle();
  });

  it('New game leaves the first match for a plain game', async () => {
    await boot('?firstrun');
    byId('coldopen-begin').click();
    byId('new-game').click();
    expect(run()).toBeUndefined();
    expect(byId('coach').hidden).toBe(true);
  });

  describe('for a new player, the lock on', () => {
    it('lands in it with no cold open and no Hub, and marks nothing played: the lock stays on until the win', async () => {
      await boot('/', { webdriver: false });
      expect(byId('coldopen').hidden).toBe(true);
      expect(run()).toBe('match');
      expect(plate()).toBe(stepLine('select', false));
      expect(document.body.dataset.hub).toBeUndefined();
      expect(localStorage.getItem('ab-alone.firstrun')).toBeNull();
    });

    it('a win shows the unlock card instead of the plate', async () => {
      const game = await boot('?newplayer&firstrun');
      byId('coldopen-begin').click();
      expect(document.body.dataset.unlocked).toBe('0');
      game.hook('__playMoves', BLACK_WINS);
      expect(byId('unlock').hidden).toBe(false);
      expect(byId('coach').hidden).toBe(true);
      expect(document.body.dataset.unlocked).toBe('1');
      byId('unlock-dismiss').click();
      game.hook('__playMoves', []); // a refresh
      expect(byId('coach').hidden).toBe(true); // the plate does not come back after the card
    });

    it('Skip hides the plate and keeps the board, the lock and the match: later steps do not bring it back', async () => {
      const game = await boot('/', { webdriver: false });
      byId('coach-skip').click();
      expect(byId('coach').hidden).toBe(true);
      expect(run()).toBe('match');
      expect(document.body.dataset.hub).toBeUndefined();
      expect(document.body.dataset.unlocked).toBe('0');
      game.click(0, 2);
      game.click(0, 1);
      expect(byId('coach').hidden).toBe(true);
    });

    it('a loss leaves the lock on, with the plate saying New game starts again', async () => {
      const game = await boot('?newplayer&firstrun');
      byId('coldopen-begin').click();
      game.hook('__playMoves', WHITE_WINS);
      expect(plate()).toBe(COACH.lost);
      expect(document.body.dataset.unlocked).toBe('0');
    });
  });
});

describe("the path after the first run", () => {
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

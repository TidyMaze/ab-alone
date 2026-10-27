// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { dailyFor, dailyTitle, utcDay } from './daily';
import { boot, slowKeys, type Game } from './test/harness';

// Boss fights and the daily challenge on the harness (decision #445, task #454): the boss list, Retry, the Goal control,
// the daily challenge and its result card, the boss block of the HUD, and The Hull, The Chaplain and The Choir drawn on
// the board with their tells and the tells' sounds.

type Move = { cells: Axial[]; dir: number };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const body = (): DOMStringMap => document.body.dataset;

/** The random fight seed a picked boss draws from now on. */
const drawSeed = (seed: number): void =>
  void vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(seed);
    return a;
  });
/** Starts the fight against `name` from the mode menu, with `seed` as the random fight seed. */
function fightBoss(game: Game, name: string, seed = 1): void {
  drawSeed(seed);
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === name)!.click();
}
/** Plays `mv` by two clicks: its marble, then the cell it goes to. */
function play(game: Game, mv: Move): void {
  const [q, r] = mv.cells[0]!;
  const [dq, dr] = DIRS[mv.dir]!;
  game.click(q, r);
  game.click(q + dq, r + dr);
}
/** The first legal one-marble move forward (NE or NW for the side at the bottom), the boss tests' move. */
const forward = (game: Game): Move =>
  game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
/** Lets the bot reply until `done` holds. */
async function until(game: Game, done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i++) await game.settle();
  expect(done()).toBe(true);
}
/** One boss turn: a forward move, then the boss reply. */
async function turn(game: Game): Promise<void> {
  const plies = game.hook<number>('__plies');
  play(game, forward(game));
  await until(game, () => game.hook<number>('__plies') === plies + 2);
}
/** Moves the pointer over a cell (the hover that draws the ghost), or off the board with null. */
function hover(game: Game, cell: Axial | null): void {
  const { x, y } = cell ? game.hook<{ x: number; y: number }>('__cellToScreen', ...cell) : { x: 1, y: 1 };
  document.querySelector('body > canvas')!.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
}
/** A key press: the gesture that starts the audio. */
const gesture = (): boolean => dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
const cues = (game: Game): string[] => game.hook<string[]>('__tellCues');

// Ply by ply, one marble each there and back twice: the start position a third time at ply 8, a draw by repetition,
// which is a defeat against a boss (as e2e/fight-end.ts). ?bot=off plays both sides.
const THERE_AND_BACK: [number, number, number, number][] = [
  [0, 2, 0, 1],
  [0, -2, 0, -1],
  [0, 1, 0, 2],
  [0, -1, 0, -2],
];
function loseByRepetition(game: Game): void {
  for (const [q, r, tq, tr] of [...THERE_AND_BACK, ...THERE_AND_BACK]) {
    game.click(q, r);
    game.click(tq, tr);
  }
  expect(game.hook('__plies')).toBe(8);
}
const DAY = Date.parse('2027-01-26T08:00:00Z'); // its daily boss is The Echo, with 12 bosses (#751)
const NEXT_DAY = Date.parse('2027-01-27T08:00:00Z');

describe('main.ts boss fights', () => {
  it('lists the bosses behind Boss fight, the button opens and closes the list', async () => {
    await boot('?bot=off');
    const button = byId('boss-fight');
    const list = byId('boss-list');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect([...list.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'The Echo',
      'The Hull',
      'The Choir',
      'The Chaplain',
      'The Ballast Mind',
      'The Alien',
      'The Rail Yard',
      'The Magnetizer',
      'The Pulsar',
      'The Overseer',
      'The Assembly Line',
      'The Unstable Core',
    ]);
    expect(list.hidden).toBe(true);
    button.click();
    expect(list.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(list.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a picked boss switches the page to its fight: the boss block, the goal, Retry, no local controls', async () => {
    const game = await boot('?bot=off');
    fightBoss(game, 'The Echo', 42);
    expect(game.hook('__fight')).toEqual({ id: 'echo', seed: 42 });
    expect(body().boss).toBe('echo');
    expect(byId('mode-menu').hidden).toBe(true); // picking a mode closes the menu
    expect(byId('modes').getAttribute('aria-expanded')).toBe('false');
    expect(byId('boss-list').hidden).toBe(true);
    expect(byId('boss-fight').getAttribute('aria-expanded')).toBe('false');
    expect(byId('boss-retry').hidden).toBe(false);
    expect(byId('new-game').hidden).toBe(true);
    expect(byId('hint').hidden).toBe(true); // fair play: no hint, no evaluation bar (#164)
    expect(byId('eval').hidden).toBe(true);
    expect(byId('setting-export-game').hidden).toBe(true);
    expect(byId('daily-card').hidden).toBe(true);
    const boss = byId('hud').querySelector('.boss')!;
    expect(boss.querySelector('strong')!.textContent).toBe('The Echo');
    expect([...boss.querySelectorAll('.notch')].map((n) => n.textContent)).toEqual(['P1', 'P2', 'P3']);
    expect(boss.querySelector('.notch.active')!.textContent).toBe('P1');
    expect(boss.querySelector('.goal')!.textContent).toBe(
      'Goal: It mirrors your move. Eject 6 to win; lose 6 or draw to lose.',
    );
    expect(boss.querySelector('.result')).toBeNull();
    expect(boss.querySelector('.tell')).toBeNull(); // The Echo draws no tell on the board
    expect(game.turn()).toBe('White to move'); // the player wears the glass, White
    // The goal is on the plate before the first move: the Goal control shows it open and cannot fold it.
    const goal = byId<HTMLButtonElement>('boss-goal');
    expect(goal.hidden).toBe(false);
    expect(goal.disabled).toBe(true);
    expect(goal.getAttribute('aria-expanded')).toBe('true');
    // The phase notches on the rim (#356): one groove per notch, the threshold glyph.
    const notches = game.hook<{ lit: number; dark: number; glyph: boolean }>('__notches');
    expect(notches.lit + notches.dark).toBeGreaterThan(0);
    expect(notches.glyph).toBe(true);
    expect(game.hook('__tally')).toEqual([{ marked: 0, slots: 6 }, { marked: 0, slots: 6 }]); // marbles lost
  });

  it('the boss replies to the player in the worker, at the test budget', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true });
    fightBoss(game, 'The Echo');
    await turn(game);
    expect(game.turn()).toBe('White to move');
    expect(byId('hud').querySelector('.boss strong')!.textContent).toBe('The Echo');
  });

  it('after the first move the Goal control folds the goal away and opens it again', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightBoss(game, 'The Echo');
    play(game, forward(game));
    const goal = byId<HTMLButtonElement>('boss-goal');
    const shown = (): boolean => byId('hud').querySelector('.boss .goal') !== null;
    expect(goal.disabled).toBe(false);
    expect(goal.getAttribute('aria-expanded')).toBe('false');
    expect(shown()).toBe(false);
    goal.click();
    expect(goal.getAttribute('aria-expanded')).toBe('true');
    expect(shown()).toBe(true);
    goal.click();
    expect(shown()).toBe(false);
    // A new fight starts with the goal folded again once a move is played.
    goal.click();
    fightBoss(game, 'The Hull');
    play(game, forward(game));
    expect(shown()).toBe(false);
  });

  it('Retry restarts the same boss with the same seed', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightBoss(game, 'The Chaplain', 7);
    play(game, forward(game));
    expect(game.hook('__plies')).toBe(1);
    drawSeed(99); // Retry draws no new seed
    byId('boss-retry').click();
    expect(game.hook('__plies')).toBe(0);
    expect(game.hook('__fight')).toEqual({ id: 'chaplain', seed: 7 });
    expect(byId('hud').querySelector('.boss strong')!.textContent).toBe('The Chaplain');
    expect(byId('boss-retry').hidden).toBe(false);
  });

  it('Retry while the boss thinks drops its reply to the old fight', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true });
    fightBoss(game, 'The Echo');
    play(game, forward(game));
    expect(game.hook('__plies')).toBe(1); // the boss is thinking
    byId('boss-retry').click();
    await game.settle();
    expect(game.hook('__plies')).toBe(0);
    expect(game.turn()).toBe('White to move');
    await turn(game); // the new fight goes on as usual
  });

  it('Retry while the boss turns of the e2e hook play stops them', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true });
    fightBoss(game, 'The Echo');
    const played = game.hook<Promise<number>>('__playTurns', 3, [4, 2]);
    while (game.hook<number>('__plies') === 0) await Promise.resolve(); // the first move is played, the boss thinks
    byId('boss-retry').click();
    expect(await played).toBe(0);
    expect(game.hook('__plies')).toBe(0);
  });

  it('a lost fight hides the Goal control and leaves the Defeat to the end banner', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightBoss(game, 'The Echo');
    loseByRepetition(game);
    expect(body().over).toBe('loss');
    expect(game.hud()).toContain('Defeat');
    expect(byId('boss-goal').hidden).toBe(true);
    expect(byId('hud').querySelector('.boss .result')).toBeNull(); // one line less in the plate (#271)
    expect(byId('daily-card').hidden).toBe(true); // a boss fight that is not the daily has no result card
  });

  it('a won fight records the boss as beaten in the hub progress, a lost one does not (#520)', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    const beaten = (): unknown => JSON.parse(localStorage.getItem('ab-alone.progress') ?? '{}').beaten;
    fightBoss(game, 'The Echo');
    loseByRepetition(game);
    expect(beaten()).toBeUndefined();
    const { Encounter } = await import('abalone-wasm');
    fightBoss(game, 'The Hull');
    vi.spyOn(Encounter.prototype, 'result').mockReturnValue(1); // a win, without playing six ejections
    play(game, forward(game));
    expect(beaten()).toEqual(['hull']);
  });

  it('the flat HUD lists the boss phase and its tell as text', async () => {
    const game = await boot('?bot=off');
    byId('setting-flat-hud').click();
    fightBoss(game, 'The Echo');
    expect(game.hud()).toContain('Boss phase: 1 of 3');
    expect(game.hud()).toContain('Tell: none');
    fightBoss(game, 'The Choir');
    expect(game.hud()).toContain('Tell: Next army: Alto');
  });

  it('online, Boss fight and Daily challenge start nothing', async () => {
    slowKeys();
    const game = await boot('?bot=off#room=boss-test');
    await game.online(); // the invite link joins the room
    expect(game.room()).toBe('boss-test');
    byId('boss-fight').click();
    expect(byId('boss-list').hidden).toBe(true);
    byId('daily').click();
    expect(game.hook('__fight')).toBeNull();
    expect(body().boss).toBeUndefined();
  });
});

describe('main.ts daily challenge', () => {
  it('the button names the day and its boss; each start counts an attempt, Retry included', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(DAY);
    const game = await boot('?bot=off', { reducedMotion: true });
    const daily = byId<HTMLButtonElement>('daily');
    expect(daily.disabled).toBe(false);
    expect(daily.textContent).toBe('Daily challenge 2027-01-26: The Echo');
    expect(daily.querySelector('span')!.textContent).toBe('The Echo'); // held upright it takes a line of its own (#575)
    game.openModes();
    daily.click();
    expect(byId('mode-menu').hidden).toBe(true);
    expect(game.hook('__fight')).toMatchObject({ id: 'echo', daily: { day: '2027-01-26', attempt: 1 } });
    expect(byId('hud').querySelector('.boss .daily')!.textContent).toBe('Daily challenge 2027-01-26 · attempt 1');
    expect(localStorage.getItem('ab-alone.daily')).toBe('2027-01-26 1');
    const seed = game.hook<{ seed: number }>('__fight').seed;
    play(game, forward(game));
    byId('boss-retry').click();
    expect(game.hook('__plies')).toBe(0);
    expect(game.hook('__fight')).toEqual({ id: 'echo', seed, daily: { day: '2027-01-26', attempt: 2 } });
    expect(byId('hud').querySelector('.boss .daily')!.textContent).toBe('Daily challenge 2027-01-26 · attempt 2');
  });

  // Bug #715: each boss of the list, on a day it is the daily boss, is named on the button (the e2e layout check takes
  // the widest name only).
  it('names every boss of the list on a day it is the daily boss', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(DAY);
    const game = await boot('?bot=off');
    const names = [...byId('boss-list').querySelectorAll('button')].map((b) => b.textContent!); // in the order of boss_ids()
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) {
      let ms = DAY;
      while (dailyFor(utcDay(ms), names).id !== name) ms += 86_400_000;
      now.mockReturnValue(ms);
      byId('daily').click(); // the start reads the day again, as the minute timer does
      expect(byId('daily').textContent).toBe(dailyTitle(utcDay(ms), name));
      expect(game.hud()).toContain(name);
    }
  });

  it('Retry after 00:00 UTC starts the new day’s fight, its first attempt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(DAY);
    const game = await boot('?bot=off');
    byId('daily').click();
    const first = game.hook<{ id: string; seed: number }>('__fight');
    vi.spyOn(Date, 'now').mockReturnValue(NEXT_DAY);
    byId('boss-retry').click();
    const next = game.hook<{ seed: number; daily: unknown }>('__fight');
    expect(next.daily).toEqual({ day: '2027-01-27', attempt: 1 });
    expect(next.seed).not.toBe(first.seed);
    expect(byId('daily').textContent).toMatch(/^Daily challenge 2027-01-27: The /);
    expect(localStorage.getItem('ab-alone.daily')).toBe('2027-01-27 1');
  });

  it('a finished daily shows its result card, and Copy puts the text on the clipboard', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(DAY);
    const game = await boot('?bot=off', { reducedMotion: true });
    byId('daily').click();
    const card = byId('daily-card');
    const text = byId<HTMLTextAreaElement>('daily-result');
    expect(card.hidden).toBe(true); // the fight is on
    expect(text.value).toBe('');
    loseByRepetition(game);
    expect(card.hidden).toBe(false);
    expect(text.value).toBe(
      'AB-ALONE daily 2027-01-26: The Echo\nDefeat in 8 plies on attempt 1\nhttps://tidymaze.github.io/ab-alone/',
    );
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      byId('daily-copy').click();
      await game.settle();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
    expect(writeText).toHaveBeenCalledWith(text.value);
    expect(game.hud()).toContain(' · result copied');
    // Retry hides the card again: the new attempt is on.
    byId('boss-retry').click();
    expect(card.hidden).toBe(true);
    expect(text.value).toBe('');
  });

  it('when the browser refuses the clipboard, the result is selected to copy by hand, and stays selected', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(DAY);
    const game = await boot('?bot=off', { reducedMotion: true });
    byId('daily').click();
    loseByRepetition(game);
    const text = byId<HTMLTextAreaElement>('daily-result');
    byId('daily-copy').click(); // jsdom has no clipboard: the copy fails
    await game.settle();
    expect(game.hud()).toContain(' · result selected: copy it by hand');
    expect(document.activeElement).toBe(text);
    expect([text.selectionStart, text.selectionEnd]).toEqual([0, text.value.length]); // the HUD update kept it
  });
});

describe('main.ts boss tells', () => {
  it('The Hull: a cracked rim cell wears the decal and its line, ticks down, then is a hole in the frame', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true, audio: true });
    gesture();
    fightBoss(game, 'The Hull');
    expect(body().cracks).toBe('0');
    expect(game.hook('__crackDecals')).toEqual([]);
    for (let n = 0; n < 4; n++) await turn(game); // the rim cracks at ply 8
    expect(body().cracks).toBe('1');
    expect(byId('hud').querySelector('.boss .tell')!.textContent).toBe('Rim cracks: 1 cell in 2 plies');
    const cracks = game.hook<{ cell: Axial }[]>('__cracks');
    expect(game.hook('__crackDecals')).toEqual(cracks.map((c) => c.cell));
    expect(cues(game)).toEqual(['crack']); // the crack appears
    expect(game.hook('__crackDecalShown', false)).toBe(false); // the e2e contrast check hides the decal
    expect(game.hook('__crackDecalShown', true)).toBe(true);
    await turn(game);
    expect(cues(game)).toEqual(['crack', 'crack']); // it ticked down on ply 9, then vanished: no cue for a gone tell
    expect(body().cracks).toBe('0');
    expect(body().vanished).toBe('1');
    expect(game.hook('__crackDecals')).toEqual([]);
    expect(game.hook('__frame')).toMatchObject({ radius: 4, holes: 1, drawn: true });
    expect(byId('hud').querySelector('.boss .tell')).toBeNull();
  }, 60_000);

  it('The Chaplain: a hovered move shows the marbles it exposes to a flip, with one cue per new tell', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true, audio: true });
    gesture();
    fightBoss(game, 'The Chaplain');
    const exposing = (): Move | undefined =>
      game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && game.hook<Axial[]>('__preview', m).length > 0);
    for (let n = 0; n < 20 && !exposing(); n++) await turn(game);
    const mv = exposing()!;
    const [q, r] = mv.cells[0]!;
    const [dq, dr] = DIRS[mv.dir]!;
    game.click(q, r); // the marble is selected
    hover(game, [q + dq, r + dr]); // the move is hovered: its ghost and the flip preview
    const flips = game.hook<Axial[]>('__preview', mv).length;
    expect(body().flips).toBe(String(flips));
    expect(byId('hud').querySelector('.boss .tell')!.textContent).toContain('Flips next boss turn');
    expect(cues(game).filter((c) => c === 'flip')).toHaveLength(1);
    hover(game, [q + dq, r + dr]); // the same cell again: nothing changes
    expect(cues(game).filter((c) => c === 'flip')).toHaveLength(1);
    hover(game, null); // off the board: no ghost, no preview
    expect(body().flips).toBe('0');
    expect(body().ghosts).toBe('0');
    expect(byId('hud').querySelector('.boss .tell')).toBeNull();
  }, 60_000);

  it('The Chaplain: a converted marble is drawn and the HUD counts it', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true });
    fightBoss(game, 'The Chaplain', 1);
    expect(await game.hook<Promise<number>>('__playTurns', 17, [4, 2])).toBe(17); // the conversion comes on turn 18
    expect(body().converted).toBe('0');
    await turn(game);
    const converted = game.hook<Axial[]>('__converted');
    expect(converted.length).toBeGreaterThan(0);
    expect(body().converted).toBe(String(converted.length));
    expect(byId('hud').querySelector('.boss .tell')!.textContent).toContain('Converted:');
    expect(game.hud()).toContain('White ejected 1/6'); // the boss marble lost for the flip, bug #299
  }, 60_000);

  it('The Choir: a glyph per army, the next army ringed and named', async () => {
    const game = await boot('?nodes=200', { reducedMotion: true, audio: true });
    gesture();
    fightBoss(game, 'The Choir');
    expect(game.hud()).toContain('White ejected 0/6 · Black ejected 0/6');
    expect(byId('hud').querySelectorAll('.boss .notch')).toHaveLength(3);
    expect(byId('hud').querySelector('.boss .tell')!.textContent).toBe('Next army: Alto');
    expect(body().vanished).toBe('0'); // the standard board
    expect(body().armies).toBe('18');
    expect(body().nextArmy).toBe('Alto');
    expect(game.hook('__frame')).toMatchObject({ radius: 4 });
    expect(cues(game)).toEqual(['choir']);
    type Member = { cell: Axial; army: number };
    const cellsOf = (army: number): string[] =>
      game
        .hook<Member[]>('__armies')
        .filter((m) => m.army === army)
        .map((m) => m.cell.join())
        .sort();
    const before = [0, 1, 2].map(cellsOf);
    await turn(game);
    expect(cellsOf(0)).not.toEqual(before[0]); // Alto, the army in turn, moved
    expect(cellsOf(1)).toEqual(before[1]);
    expect(cellsOf(2)).toEqual(before[2]);
    expect(body().nextArmy).toBe('Tenor');
    expect(byId('hud').querySelector('.boss .tell')!.textContent).toBe('Next army: Tenor');
    expect(cues(game)).toEqual(['choir', 'choir']); // once more for Tenor, not for the human move
  }, 60_000);

  it('The Choir sinks the army it removed after the push, a marble at a time (#747)', async () => {
    const game = await boot('?bot=off');
    const { Encounter } = await import('abalone-wasm');
    fightBoss(game, 'The Choir');
    const single = (): Move => game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
    play(game, single()); // the player's move removes no army
    game.frame(1000);
    expect(body().sunk).toBeUndefined();
    vi.spyOn(Encounter.prototype, 'removed').mockReturnValue(Int32Array.from([-4, 1, 2, -4, 2, 2]));
    play(game, single()); // the move that, say, ejected the third marble: the weakest army is removed
    expect(body().sunk).toBeUndefined(); // the slide goes first
    game.frame(1000);
    expect(body().sunk).toBe('2');
  });

  it('the boss hooks of the browser checks read nothing outside a fight', async () => {
    const game = await boot('?bot=off');
    expect(game.hook('__preview', game.hook<Move[]>('__legal')[0])).toEqual([]);
    expect(game.hook('__armies')).toEqual([]);
    expect(game.hook('__cracks')).toEqual([]);
    expect(game.hook('__converted')).toEqual([]);
    expect(game.hook('__fight')).toBeNull();
  });

  it('a hovered move in a fight also draws the boss reply it announces', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    const ghostsOf = (name: string): number => {
      fightBoss(game, name);
      const mv = forward(game);
      const [q, r] = mv.cells[0]!;
      const [dq, dr] = DIRS[mv.dir]!;
      game.click(q, r);
      hover(game, [q + dq, r + dr]);
      return Number(body().ghosts);
    };
    const echo = ghostsOf('The Echo');
    const hull = ghostsOf('The Hull');
    expect(hull).toBeGreaterThan(0);
    expect(echo).toBeGreaterThan(hull); // The Echo announces its mirror reply
  });

  it('The Ballast Mind announces echo only from phase 3 (#574)', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightBoss(game, 'The Ballast Mind');
    const mv = forward(game);
    const [q, r] = mv.cells[0]!;
    const [dq, dr] = DIRS[mv.dir]!;
    game.click(q, r);
    hover(game, [q + dq, r + dr]);
    expect(Number(body().ghosts)).toBe(1);

    const { Encounter } = await import('abalone-wasm');
    const echoRecord = new Int32Array([1, 5, 2, -3, 0, 0, 0, 0]);
    vi.spyOn(Encounter.prototype, 'tell_move').mockReturnValue(echoRecord);
    hover(game, null);
    hover(game, [q + dq, r + dr]);
    expect(Number(body().ghosts)).toBeGreaterThan(1);
  });

  it('The Ballast Mind fight sets view for radius 5 and reset-view restores it (#573)', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightBoss(game, 'The Ballast Mind');
    const v = game.hook<{ distance: number }>('__view');
    expect(v.distance).toBeCloseTo((5 / 4) * Math.hypot(11, 8));
    byId('reset-view').click();
    const vReset = game.hook<{ distance: number }>('__view');
    expect(vReset.distance).toBeCloseTo((5 / 4) * Math.hypot(11, 8));
  });
});

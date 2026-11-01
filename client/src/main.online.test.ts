// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeMove, moveForClick, parseMoves, type Axial } from './board';
import { generateKeys, signCoordinator, signHello, type Report, type Wire } from './moverecord';
import { SIGNALING_TIMEOUT_MS } from './netcounters';
import { OnlineSession } from './session';
import { fingerprint } from './invite';
import { boot, type Game } from './test/harness';
import type { Transport } from './transport';

// The online part of main.ts on the harness (src/test/harness.ts, decision #445): Play online and the invite link,
// the session's callbacks as the HUD shows them, rematch, connectivity, Copy diagnostics and the service worker.
// The opponent is a real OnlineSession on the other end of the room, with its own engine.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const data = (): DOMStringMap => document.body.dataset;
const presence = (): string => document.querySelector('#hud .presence')?.textContent ?? '';

/** Settles until `ok` holds: signatures are checked on the real Web Crypto, which takes a few tasks. */
async function until(game: Game, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !ok(); i++) await game.settle();
  expect(ok()).toBe(true);
}

/** The other player: a session with its own engine on `transport`, which plays a move by its cells. `version` is
 * added to the engine version its Hello carries, so it can run another one (#526). */
async function opponent(transport: Transport, room: string, side: number, version = 0) {
  const { Engine, engine_version } = await import('abalone-wasm');
  let engine = new Engine();
  const keys = await generateKeys();
  const reports: Report[] = []; // the page's match reports (#1317)
  const session = new OnlineSession({
    game: room,
    side,
    engine: engine_version() + version,
    keys,
    transport,
    judge: {
      to_move: () => engine.to_move(),
      play: (mv) => engine.play(mv),
      status: () => engine.status(),
      restart: () => (engine = new Engine()),
    },
    onMove: () => {},
    onRefuse: () => {},
    onReport: (r) => reports.push(r),
    beat: { ms: 5000, now: Date.now, every: () => {} }, // sends the join order the coordinator migration needs
  });
  const play = async (from: Axial, to: Axial): Promise<void> => {
    const record = encodeMove(moveForClick(parseMoves(engine.legal_moves()), [from], to)!);
    engine.play(Int32Array.from(record));
    await session.send(record);
  };
  // What this player says of the finished game: the board it sees, unless the test lies about it.
  const report = (rating: number, hash = Array.from(engine.board()).join(',')) => session.report({ hash, status: engine.status(), rating });
  return { session, keys, play, reports, report };
}

/** Plays a move on the page by its two clicks, then lets its slide end. */
function click(game: Game, from: Axial, to: Axial): void {
  game.click(...from);
  game.click(...to);
  game.frame(5000);
}

/** Boots, presses Play online in the mode menu, and seats a White opponent once the page's session exists. */
async function hosted(url = '?bot=off') {
  const game = await boot(url);
  game.openModes();
  byId('play-online').click();
  await until(game, () => data().seat === 'player');
  const white = await opponent(game.peer()!, game.room()!, 2);
  await until(game, () => data().opponent === 'here');
  return { game, white };
}

/** Presses Ranked and seats a White opponent (#1317). */
async function rankedHosted() {
  const game = await boot('?bot=off');
  game.openModes();
  byId('ranked').click();
  await until(game, () => data().seat === 'player');
  const white = await opponent(game.peer()!, game.room()!, 2);
  await until(game, () => data().opponent === 'here');
  return { game, white };
}

/** Ends the game by threefold repetition, a draw, and waits for the page's report to reach `white`. */
async function drawGame(game: Game, white: Awaited<ReturnType<typeof opponent>>): Promise<void> {
  const there: Axial[][] = [[[0, 2], [0, 1]], [[0, -2], [0, -1]], [[0, 1], [0, 2]], [[0, -1], [0, -2]]];
  for (let ply = 0; ply < 8; ply += 2) {
    const [mine, theirs] = [there[ply % 4]!, there[(ply + 1) % 4]!];
    click(game, mine[0]!, mine[1]!);
    await until(game, () => white.session.signedLog.length === ply + 1);
    await white.play(theirs[0]!, theirs[1]!);
    await until(game, () => game.hook('__plies') === ply + 2 && game.turn() !== 'White to move'); // the HUD too (#952)
    game.frame(5000);
  }
  await until(game, () => white.reports.length === 1);
}

/** The other end of the hook transport (?net=hook): what the page sends to `__netOut`, what it gets on `__netIn`. */
function hookEnd(): Transport & { leave(): void } {
  const w = window as unknown as Record<string, (...args: unknown[]) => void>;
  return {
    state: 'open',
    send: (message) => w.__netIn!(message, 'creator'),
    onRecord: (cb) => (w.__netOut = (message) => cb(message as Wire, 'page')),
    onState: () => {},
    onLeave: () => {},
    close: () => {},
    leave: () => w.__netLeave!('creator'),
  };
}

const calls = (): number => (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.length;
const copied = (): string =>
  (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string;
function clipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(writeText) }, configurable: true });
}

afterEach(() => {
  for (const name of ['clipboard', 'onLine', 'serviceWorker']) Reflect.deleteProperty(navigator, name);
  vi.unstubAllEnvs();
});

describe('Play online', () => {
  it('closes the mode menu, shows the invite link to the room in the address, and waits for an opponent', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    expect(byId('mode-menu').hidden).toBe(false);
    byId('play-online').click();
    expect(byId('mode-menu').hidden).toBe(true);
    await until(game, () => data().seat === 'player'); // once its keys are made, the link carries their fingerprint (#1323)
    const room = game.room()!;
    expect(room).toMatch(/^[\w-]{22}$/);
    expect(location.hash).toMatch(new RegExp(`^#room=${room}&key=[\\w-]{8}$`));
    const invite = byId<HTMLInputElement>('invite');
    expect(invite.hidden).toBe(false);
    expect(byId('invite-label').hidden).toBe(false);
    expect(new URL(invite.value).hash).toBe(location.hash);
    expect(byId('new-game').hidden).toBe(true);
    expect(byId('boss-retry').hidden).toBe(true);
    expect(data().online).toBe('Black');
    expect(data().opponent).toBe('waiting');
    expect(data().coordinator).toBe('1');
    expect(data().handover).toBe('none');
    expect(presence()).toBe('You are Black. Waiting for an opponent...');
  });

  it('scrolls the button column back to the top, so no button above the link is left out of reach (#839)', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    byId('online').scrollTop = 40; // the player scrolled down to the mode menu
    byId('play-online').click();
    await until(game, () => data().seat === 'player'); // the link shows once the keys are made
    expect(byId('online').scrollTop).toBe(0);
  });

  it('puts the fingerprint of the key that holds Black in the invite link (#1323)', async () => {
    const { white } = await hosted();
    expect(location.hash).toBe(`#room=${white.session.game}&key=${await fingerprint(white.session.seats.keyOf(1))}`);
  });

  it('as a joiner from a link with a fingerprint, takes Black only from a Hello of that key (#1323)', async () => {
    const { engine_version } = await import('abalone-wasm');
    const creator = await generateKeys();
    const rival = await generateKeys();
    const game = await boot(`?net=hook#room=the-room&key=${await fingerprint(creator.pub)}`);
    await until(game, () => data().seat === 'pending');
    const end = hookEnd();
    let page = '';
    end.onRecord((m) => (page ||= (m as { kind?: string; pub?: string }).kind === 'hello' ? (m as { pub: string }).pub : ''));
    (window as unknown as Record<string, () => void>).__netOpen!();
    await until(game, () => page !== '');
    const say = async (keys: typeof creator, roster: string[]) =>
      end.send(await signHello(keys, { game: 'the-room', seat: 1, roster, engine: engine_version() }));
    await say(rival, [rival.pub, page]); // signed and first, but not the key of the link
    await game.settle();
    expect(data().seat).toBe('pending');
    await say(creator, [creator.pub, page]);
    await until(game, () => data().seat === 'player');
  });

  it('shows the opponent here once its Hello is verified, then disconnected once the room closes', async () => {
    const { game } = await hosted();
    expect(presence()).toBe('You are Black. White is here.');
    game.peer()!.close();
    await until(game, () => data().opponent === 'gone');
    expect(presence()).toBe('You are Black. White is disconnected.');
    expect(game.hud()).toContain(' · closed');
  });

  it('returns to the Ship hub at any time via the Ship button, tearing down online session (#773)', async () => {
    const { game } = await hosted();
    expect(presence()).toBe('You are Black. White is here.');
    expect(data().online).toBe('Black');
    game.openModes();
    byId('ship').click();
    expect(data().online).toBeUndefined();
    expect(data().seat).toBeUndefined();
    expect(data().opponent).toBeUndefined();
    expect(byId('invite').hidden).toBe(true);
    expect(byId('new-game').hidden).toBe(false);
  });

  it('sends our moves to the opponent and replays its moves through the engine', async () => {
    const { game, white } = await hosted();
    click(game, [0, 2], [0, 1]);
    expect(game.hook('__plies')).toBe(1);
    expect(game.turn()).toBe('White to move');
    await until(game, () => white.session.signedLog.length === 1);
    await white.play([0, -2], [0, -1]);
    await until(game, () => game.hook('__plies') === 2 && game.turn() !== 'White to move'); // the HUD too (#952)
    expect(game.turn()).toBe('Black to move');
  });

  it('refuses a message the session cannot read, and says so in the HUD', async () => {
    const { game } = await hosted();
    game.peer()!.send({ kind: 'move' } as unknown as Wire);
    await until(game, () => game.hud().includes(' · refused move: malformed'));
    expect(game.hook('__plies')).toBe(0);
  });

  it('refuses an opponent on another engine version with a note, and keeps waiting for one, #526', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    byId('play-online').click();
    await until(game, () => data().seat === 'player');
    await opponent(game.peer()!, game.room()!, 2, 1);
    await until(game, () => game.hud().includes(' · refused move: engine-version'));
    expect(data().opponent).toBe('waiting');
    expect(presence()).toBe('You are Black. Waiting for an opponent...');
  });

  it('Ranked queues 1v1 with rank badge and tolerance window, and updates Elo rating on game end (#711)', async () => {
    const game = await boot('?bot=off');
    game.openModes();
    const rankedBtn = byId<HTMLButtonElement>('ranked');
    expect(rankedBtn.disabled).toBe(false);
    rankedBtn.click();
    expect(byId('mode-menu').hidden).toBe(true);
    await until(game, () => data().seat === 'player');
    expect(byId('hud').querySelector('.rank-badge')?.textContent).toContain('Silver');
    expect(byId('hud').querySelector('.rank-queue')?.textContent).toBe('Queue ±100');

    const white = await opponent(game.peer()!, game.room()!, 2);
    await until(game, () => data().opponent === 'here');
    expect(byId('hud').querySelector('.rank-queue')).toBeNull();

    await drawGame(game, white);
    // Rated only once the opponent's signed report is in (#1317).
    expect(byId('hud').querySelector('.rank-delta')).toBeNull();
    expect(byId('hud').querySelector('.rank-result')?.textContent).toBe('Waiting for the opponent report');
    expect(localStorage.getItem('ab-alone.ranked')).toBeNull();
    await white.report(1200);
    await until(game, () => byId('hud').querySelector('.rank-delta') !== null);
    expect(byId('hud').querySelector('.rank-delta')?.textContent).toBe('+0 Elo');
    expect(byId('hud').querySelector('.rank-result')).toBeNull();
    expect(JSON.parse(localStorage.getItem('ab-alone.ranked')!).matches).toHaveLength(1);
    expect(white.reports).toMatchObject([{ side: 1, status: 3, rating: 1200 }]); // ours reached the opponent, signed by our key
  });

  it('Ranked rates against the opponent real rating from its report, not a default (#1317)', async () => {
    const { game, white } = await rankedHosted();
    await drawGame(game, white);
    await white.report(1400);
    await until(game, () => byId('hud').querySelector('.rank-delta') !== null);
    const delta = Number(/^[+-]\d+/.exec(byId('hud').querySelector('.rank-delta')!.textContent!)![0]);
    expect(delta).toBeGreaterThan(0); // a draw against a 1400 opponent pays a 1200 player
  });

  it('Ranked refuses a report that differs from ours and rates nothing (#1317)', async () => {
    const { game, white } = await rankedHosted();
    await drawGame(game, white);
    await white.report(1200, 'another board');
    await until(game, () => byId('hud').querySelector('.rank-result')?.textContent === 'Not rated: the reports differ');
    expect(byId('hud').querySelector('.rank-delta')).toBeNull();
    expect(localStorage.getItem('ab-alone.ranked')).toBeNull();
  });

  it('Ranked in Battle royale shows rank badge and updates Battle Royale Elo on placement (#711)', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    game.openModes();
    byId('battle-royale').click();
    game.openModes();
    byId('ranked').click();
    expect(byId('hud').querySelector('.rank-badge')?.textContent).toContain('Silver');
    // Load a finished royale state via __royale hook while in ranked royale mode
    const { Royale } = await import('abalone-wasm');
    const r = new Royale(6, 7);
    const rounds: number[][] = [];
    while (r.placement().length === 0) {
      r.resolve(new Int32Array());
      rounds.push([]);
    }
    (window as unknown as { __royale(f: { seed: number; rounds: number[][] }): void }).__royale({ seed: 7, rounds });
    expect(byId('hud').querySelector('.rank-delta')?.textContent).toMatch(/^[+-]\d+ Elo$/);
    expect(JSON.parse(localStorage.getItem('ab-alone.ranked')!).matches[0].mode).toBe('royale');
  });
});

describe('Rematch', () => {
  it('appears once the game is over, waits for the opponent, then starts a new game, colours swapped', async () => {
    const { game, white } = await hosted();
    const rematch = byId<HTMLButtonElement>('rematch');
    expect(rematch.hidden).toBe(true); // the game runs
    // One marble each, there and back twice: the start position a third time, a draw by threefold repetition.
    const there: Axial[][] = [[[0, 2], [0, 1]], [[0, -2], [0, -1]], [[0, 1], [0, 2]], [[0, -1], [0, -2]]];
    for (let ply = 0; ply < 8; ply += 2) {
      const [mine, theirs] = [there[ply % 4]!, there[(ply + 1) % 4]!];
      click(game, mine[0]!, mine[1]!);
      await until(game, () => white.session.signedLog.length === ply + 1);
      await white.play(theirs[0]!, theirs[1]!);
      // The engine has White's move before the page logged it and refreshed the HUD: wait for the HUD (#952).
      await until(game, () => game.hook('__plies') === ply + 2 && game.turn() !== 'White to move');
      game.frame(5000);
    }
    expect(game.turn()).toBe('Draw');
    expect(rematch.hidden).toBe(false);
    expect(rematch.disabled).toBe(false);

    rematch.click();
    await until(game, () => rematch.disabled);
    expect(game.hud()).toContain('You asked for a rematch. Waiting for White...');
    expect(presence()).toBe('You are Black. White is here.'); // nothing starts on one ask

    await white.session.rematch();
    await until(game, () => data().online === 'White');
    expect(presence()).toBe('You are White. Black is here.');
    expect(game.hook('__plies')).toBe(0);
    expect(game.turn()).toBe('Black to move');
    expect(rematch.hidden).toBe(true);
    expect(document.querySelector('#hud .rematch')).toBeNull();
  });
});

describe('The invite link', () => {
  it('joins as White, is seated by the creator once open, follows its coordinator and sees it leave', async () => {
    const timers: (() => void)[] = [];
    const later = setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) =>
      ms === SIGNALING_TIMEOUT_MS ? timers.push(fn) : later(fn, ms)) as typeof setTimeout);
    clipboard(async () => {});
    const game = await boot('?net=hook#room=the-room');
    expect(game.room()).toBeNull(); // no Trystero room
    await until(game, () => data().seat === 'pending');
    expect(data().online).toBe('White');
    expect(presence()).toBe('Joining as White...');

    // The joiner gives up waiting for the signaling server after a while: the diagnostics say so.
    expect(timers).toHaveLength(1);
    game.frame(SIGNALING_TIMEOUT_MS);
    timers[0]!();

    const end = hookEnd();
    const black = await opponent(end, 'the-room', 1);
    (window as unknown as Record<string, () => void>).__netOpen!();
    await until(game, () => data().seat === 'player' && data().opponent === 'here');
    expect(presence()).toBe('You are White. Black is here.');
    expect(game.hud()).toContain(' · open');
    expect(black.session.seats.roster()).toHaveLength(2);

    // The creator announces itself as coordinator: we follow it and acknowledge.
    end.send(await signCoordinator(black.keys, { game: 'the-room', coordinator: black.keys.pub }));
    await until(game, () => data().handover === 'done');
    expect(data().coordinator).toBe('1');

    end.leave();
    await until(game, () => data().opponent === 'gone');
    expect(presence()).toBe('You are White. Black is disconnected.');

    byId('copy-diagnostics').click();
    await until(game, () => calls() > 0);
    expect(JSON.parse(copied()).events).toContainEqual(
      expect.objectContaining({ event: 'net', data: { failure: 'signaling-timeout' } }),
    );
  });

  it('watches as a spectator when the room is full', async () => {
    const game = await boot('?net=hook#room=full-room');
    await until(game, () => data().seat === 'pending');
    const [creator, other] = [await generateKeys(), await generateKeys()];
    const hello = await signHello(creator, { game: 'full-room', seat: 1, roster: [creator.pub, other.pub], engine: (await import('abalone-wasm')).engine_version() });
    (window as unknown as Record<string, (m: Wire, peer: string) => void>).__netIn!(hello, 'creator');
    await until(game, () => data().seat === 'spectator');
    expect(data().online).toBe('Spectator');
    expect(presence()).toBe('Room is full, watching');
  });

  it("reports Trystero's join errors in the diagnostics", async () => {
    clipboard(async () => {});
    const game = await boot('?bot=off');
    const p2p = await import('./p2p');
    const transport = vi.spyOn(p2p, 'p2pTransport');
    game.openModes();
    byId('play-online').click();
    transport.mock.calls[0]![1]!('ICE failed');
    byId('copy-diagnostics').click();
    await until(game, () => calls() > 0);
    expect(JSON.parse(copied()).events).toContainEqual(
      expect.objectContaining({ event: 'net', data: { failure: 'join-error', message: 'ICE failed' } }),
    );
  });
});

describe('Copy on the invite link (#839)', () => {
  /** Boots, presses Play online and waits for the room: the link, its label and Copy show. */
  async function invited() {
    const game = await boot('?bot=off');
    game.openModes();
    byId('play-online').click();
    await until(game, () => data().seat === 'player'); // the room is open before the test ends
    return game;
  }
  const shown = (): boolean[] => ['invite-label', 'invite', 'invite-copy'].map((id) => !byId(id).hidden);

  it('shows with the link and its label, and Copy is a button named Copy', async () => {
    await invited();
    expect(shown()).toEqual([true, true, true]);
    expect(byId('invite-copy').textContent).toBe('Copy');
    expect(byId('invite-copy').tagName).toBe('BUTTON');
  });

  it('writes the link to the clipboard, then closes the link, its label and Copy', async () => {
    clipboard(async () => {});
    const game = await invited();
    const link = byId<HTMLInputElement>('invite').value;
    byId('invite-copy').click();
    await until(game, () => byId('invite').hidden === true);
    expect(calls()).toBe(1);
    expect(copied()).toBe(link);
    expect(link).toContain(`#room=${game.room()}`);
    expect(shown()).toEqual([false, false, false]);
  });

  it('says the link was copied and gives the focus to Game modes (#1190)', async () => {
    clipboard(async () => {});
    const game = await invited();
    byId('invite-copy').focus();
    byId('invite-copy').click();
    await until(game, () => byId('invite').hidden === true);
    expect(game.hud()).toContain('invite link copied');
    expect(document.activeElement).toBe(byId('modes'));
  });

  it('keeps the link shown, selected, when the browser refuses the clipboard', async () => {
    clipboard(async () => {
      throw new Error('denied');
    });
    const game = await invited();
    const link = byId<HTMLInputElement>('invite');
    byId('invite-copy').click();
    await until(game, () => game.hud().includes('invite link selected'));
    expect(shown()).toEqual([true, true, true]);
    expect(document.activeElement).toBe(link);
    expect([link.selectionStart, link.selectionEnd]).toEqual([0, link.value.length]);
  });

  it('keeps the link shown when the page has no clipboard at all', async () => {
    const game = await invited();
    byId('invite-copy').click();
    await until(game, () => game.hud().includes('invite link selected'));
    expect(shown()).toEqual([true, true, true]);
  });

  it('closes with the room, and shows again with the next one', async () => {
    const game = await invited();
    game.openModes();
    byId('ship').click(); // Back to the ship
    expect(shown()).toEqual([false, false, false]);
    game.openModes();
    byId('play-online').click();
    await until(game, () => data().seat === 'player');
    expect(shown()).toEqual([true, true, true]);
  });
});

describe('Connectivity', () => {
  it('disables Play online with a HUD notice while the browser is offline, and enables it back online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const game = await boot('?bot=off');
    const button = byId<HTMLButtonElement>('play-online');
    expect(button.disabled).toBe(true);
    expect(game.hud()).toContain('online play needs a connection');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    expect(button.disabled).toBe(false);
    expect(game.hud()).not.toContain('online play needs a connection');
  });

  it('keeps an online game its own status when the connection drops', async () => {
    const { game } = await hosted();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    expect(byId<HTMLButtonElement>('play-online').disabled).toBe(true);
    expect(game.hud()).not.toContain('online play needs a connection');
    expect(presence()).toBe('You are Black. White is here.');
  });
});

describe('Copy diagnostics', () => {
  it('copies the events, the build and the game to the clipboard', async () => {
    clipboard(async () => {});
    const game = await boot('?bot=off');
    byId('copy-diagnostics').click();
    await until(game, () => game.hud().includes(' · diagnostics copied'));
    expect(byId('diagnostics').hidden).toBe(true);
    const text = JSON.parse(copied());
    expect(text).toMatchObject({ app: 'ab-alone', build: expect.stringMatching(/^(dev|[0-9a-f]{12})$/), environment: { mode: 'test', fps: null } });
    expect(text.game.mode).toBe('local');
    expect(text.game.online).toBeUndefined();
  });

  it('copies the online game and the frame rate once the FPS switch is on', async () => {
    clipboard(async () => {});
    const { game } = await hosted();
    byId('setting-fps').click();
    game.frame();
    byId('copy-diagnostics').click();
    await until(game, () => game.hud().includes(' · diagnostics copied'));
    const text = JSON.parse(copied());
    expect(text.environment.fps).toEqual(expect.any(Number));
    expect(text.game.online).toMatchObject({ game: game.room(), side: 1, role: 'player' });
    expect(text.events).toContainEqual(expect.objectContaining({ event: 'net', data: { state: 'connecting' } }));
  });

  it('selects the text in a box to copy by hand when the browser refuses, and hides it on blur', async () => {
    clipboard(() => Promise.reject(new Error('denied')));
    const game = await boot('?bot=off');
    const box = byId<HTMLTextAreaElement>('diagnostics');
    byId('copy-diagnostics').click();
    await until(game, () => game.hud().includes(' · diagnostics selected: copy them by hand'));
    expect(box.hidden).toBe(false);
    expect(JSON.parse(box.value).app).toBe('ab-alone');
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length]);
    expect(box.scrollTop).toBe(0);
    box.blur();
    expect(box.hidden).toBe(true);
  });
});

describe('The service worker', () => {
  function worker(controller: object | null, register: () => Promise<{ update(): void }>) {
    const listeners: Record<string, () => void> = {};
    const addEventListener = (type: string, fn: () => void): void => void (listeners[type] = fn);
    const sw = { controller, register: vi.fn(register), addEventListener };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
    vi.stubEnv('PROD', true);
    return { sw, change: () => listeners.controllerchange!() };
  }

  it('is registered on a first visit, and taking control then offers no reload', async () => {
    const update = vi.fn();
    const { sw, change } = worker(null, async () => ({ update }));
    const game = await boot('?bot=off');
    await game.settle();
    expect(sw.register).toHaveBeenCalledWith('/sw.js');
    expect(update).not.toHaveBeenCalled();
    change();
    expect(byId('update').hidden).toBe(true);
  });

  it('checks for a new build on a later visit, and offers the reload when one takes over', async () => {
    const update = vi.fn();
    const { change } = worker({}, async () => ({ update }));
    const game = await boot('?bot=off');
    await game.settle();
    expect(update).toHaveBeenCalledOnce();
    change();
    expect(byId('update').hidden).toBe(false);
  });

  it('lets the game go on when the registration is refused', async () => {
    const { sw } = worker(null, () => Promise.reject(new Error('blocked')));
    const game = await boot('?bot=off');
    await game.settle();
    expect(sw.register).toHaveBeenCalledOnce();
    expect(game.turn()).toBe('Black to move');
  });
});

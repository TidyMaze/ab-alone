// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { encodeMove, parseMoves, type Axial, type Move } from './board';
import { seatAfter } from './coop';
import { generateKeys } from './moverecord';
import { OnlineSession } from './session';
import { boot, type Game } from './test/harness';
import type { Transport } from './transport';

// Co-op boss fights online on the harness (docs/specs/coop-boss.md, #529): the encounter is the judge of the room.
// Every page plays the boss reply to each human move itself, before it handles the next message. The partner is a
// real OnlineSession on the other end of the room, with its own encounter. No menu entry yet (#530): the creator opens
// the room with the __coop hook, the partner joins with the co-op invite link.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const data = (): DOMStringMap => document.body.dataset;
const calm = { reducedMotion: true }; // no slide: the boss reply never waits for one
const ECHO = { boss: 'echo', seed: 7 };

/** Settles until `ok` holds: signatures are checked on the real Web Crypto, which takes a few tasks. */
async function until(game: Game, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !ok(); i++) await game.settle();
  expect(ok()).toBe(true);
}

/** The first legal one-marble move forward (NE or NW for Black at the bottom) in `moves`. */
const forward = (moves: Move[]): Move => moves.find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;

/** Plays `mv` on the page by its two clicks: its marble, then the cell it goes to. */
function play(game: Game, mv: Move): void {
  const [q, r] = mv.cells[0]!;
  const [dq, dr] = ([[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]] as Axial[])[mv.dir]!;
  game.click(q, r);
  game.click(q + dq, r + dr);
}

/** The partner: a session on `transport` with its own encounter, which plays the boss reply to every human move at
 * once, as every peer does. `fight` is the boss and seed it believes the room has. */
async function partner(transport: Transport, room: string, side: number, fight = ECHO) {
  const { Encounter, engine_version } = await import('abalone-wasm');
  const encounter = new Encounter(fight.boss, fight.seed);
  const history: number[][] = [];
  const apply = (mv: ArrayLike<number>): void => {
    encounter.play(Int32Array.from(mv));
    history.push(Array.from(mv));
  };
  const human = (mv: ArrayLike<number>): void => {
    apply(mv);
    if (encounter.status() === 0) apply(encounter.boss_move());
  };
  const session = new OnlineSession({
    game: room,
    side,
    engine: engine_version(),
    keys: await generateKeys(),
    transport,
    judge: {
      to_move: () => encounter.to_move(),
      play: human,
      status: () => encounter.status(),
      restart: () => {},
      mover: () => seatAfter(history.length, 2),
    },
    onMove: () => {},
    onRefuse: () => {},
  });
  const send = async (record: number[]): Promise<void> => {
    human(record);
    await session.send(record);
  };
  return { session, history, legal: () => parseMoves(encounter.legal_moves()), send };
}

/** Opens a co-op room against The Echo with the __coop hook and seats the partner once the page's session exists. */
async function hosted() {
  const game = await boot('?bot=off', calm);
  game.hook('__coop', ECHO.boss, ECHO.seed);
  await until(game, () => data().seat === 'player');
  const two = await partner(game.peer()!, game.room()!, 2);
  await until(game, () => data().opponent === 'here');
  return { game, two };
}

describe('co-op: the encounter judges the room', () => {
  it('__coop opens a co-op room: the invite and the address carry the boss and the seed, the fight is the boss', async () => {
    const game = await boot('?bot=off', calm);
    game.hook('__coop', 'echo', 7);
    const room = game.room()!;
    expect(location.hash).toBe(`#room=${room}&boss=echo&seed=7`);
    expect(new URL(byId<HTMLInputElement>('invite').value).hash).toBe(location.hash);
    expect(byId('invite').hidden).toBe(false);
    expect(game.hook('__fight')).toEqual({ id: 'echo', seed: 7 });
    expect(game.hud()).toContain('The Echo');
    await until(game, () => data().seat === 'player');
    expect(data().online).toBe('Black');
  });

  it('plays the boss reply to our move at once, then the partner plays its ply and gets its own reply', async () => {
    const { game, two } = await hosted();
    play(game, forward(game.hook('__legal')));
    await until(game, () => game.hook('__plies') === 2 && two.history.length === 2);
    expect(game.hook('__history')).toEqual(two.history);
    await two.send(encodeMove(forward(two.legal())));
    await until(game, () => game.hook('__plies') === 4);
    expect(game.hook('__history')).toEqual(two.history);
    expect(game.hud()).not.toContain('refused');
  });

  it("does nothing on a click during the partner's ply: no selection, no note", async () => {
    const { game, two } = await hosted();
    play(game, forward(game.hook('__legal')));
    await until(game, () => game.hook('__plies') === 2 && two.history.length === 2);
    const [q, r] = forward(game.hook('__legal')).cells[0]!;
    game.click(q, r);
    expect(game.hook('__rings')).toEqual([]);
    expect(game.hud()).not.toContain('waiting for opponent');
  });

  it("holds the partner's move that comes while our boss reply is still being computed, then plays both in order", async () => {
    const { game, two } = await hosted();
    const held: (() => void)[] = [];
    const post = Worker.prototype.postMessage;
    vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (this: Worker, req) {
      held.push(() => post.call(this, req));
    });
    play(game, forward(game.hook('__legal')));
    await until(game, () => two.history.length === 2 && held.length === 1); // the partner has the reply, we do not yet
    await two.send(encodeMove(forward(two.legal())));
    for (let i = 0; i < 5; i++) await game.settle();
    expect(game.hook('__plies')).toBe(1); // the partner's move waits behind our reply
    expect(game.hud()).not.toContain('refused');
    await until(game, () => {
      for (const reply of held.splice(0)) reply();
      return game.hook('__plies') === 4;
    });
    expect(game.hook('__history')).toEqual(two.history);
  });

  it('refuses the move of a partner whose engine disagrees, and the fight waits for that partner', async () => {
    const game = await boot('?bot=off', calm);
    game.hook('__coop', ECHO.boss, ECHO.seed);
    await until(game, () => data().seat === 'player');
    const two = await partner(game.peer()!, game.room()!, 2, { boss: 'chaplain', seed: 7 }); // a link edited by hand
    await until(game, () => data().opponent === 'here');
    play(game, forward(game.hook('__legal')));
    await until(game, () => game.hook('__plies') === 2 && two.history.length === 2);
    expect(game.hook('__history')).not.toEqual(two.history); // another boss, another reply
    const ours = game.hook<Move[]>('__legal').map((m) => encodeMove(m).join());
    await two.send(encodeMove(two.legal().find((m) => !ours.includes(encodeMove(m).join()))!));
    await until(game, () => game.hud().includes(' · refused move: illegal'));
    expect(game.hook('__plies')).toBe(2);
    const [q, r] = forward(game.hook('__legal')).cells[0]!;
    game.click(q, r);
    expect(game.hook('__rings')).toEqual([]); // still the partner's ply
  });

  it('asks no boss reply after a human move that ends the fight', async () => {
    const { game } = await hosted();
    const { Encounter } = await import('abalone-wasm');
    const { play: played, status } = Encounter.prototype;
    let over = false;
    vi.spyOn(Encounter.prototype, 'play').mockImplementation(function (this: InstanceType<typeof Encounter>, mv) {
      played.call(this, mv);
      over = true; // as the last ejection would
    });
    vi.spyOn(Encounter.prototype, 'status').mockImplementation(function (this: InstanceType<typeof Encounter>) {
      return over ? 1 : status.call(this);
    });
    const post = vi.spyOn(Worker.prototype, 'postMessage');
    play(game, forward(game.hook('__legal')));
    for (let i = 0; i < 5; i++) await game.settle();
    expect(game.hook('__plies')).toBe(1);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('co-op: the invite link', () => {
  it('joins the fight as the second seat: the creator plays first, then us, each move followed by its boss reply', async () => {
    const game = await boot('?bot=off#room=R0&boss=echo&seed=7', calm);
    expect(game.room()).toBe('R0');
    expect(game.hook('__fight')).toEqual({ id: 'echo', seed: 7 });
    const one = await partner(game.peer()!, 'R0', 1);
    await until(game, () => data().seat === 'player' && data().opponent === 'here');
    await one.send(encodeMove(forward(one.legal())));
    await until(game, () => game.hook('__plies') === 2);
    play(game, forward(game.hook('__legal')));
    await until(game, () => game.hook('__plies') === 4 && one.history.length === 4);
    expect(game.hook('__history')).toEqual(one.history);
    game.peer()!.close();
    await until(game, () => data().opponent === 'gone'); // the partner's presence, not our own seat's
  });

  it('starts nothing for an unknown boss', async () => {
    const game = await boot('?bot=off#room=R0&boss=nobody&seed=7', calm);
    expect(game.room()).toBeNull();
    expect(data().seat).toBeUndefined();
    expect(game.hook('__fight')).toBeNull();
  });
});

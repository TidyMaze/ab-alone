// The online side of the tools (docs/specs/mcp.md sections 5 and 7): the agent against a scripted peer over
// localPair(). The peer is the browser client's own OnlineSession with a real engine, so the agent meets what a human
// would. The run over real WebRTC is e2e/online.spec.ts.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SITE } from '../../client/src/daily';
import { fingerprint, inviteUrl } from '../../client/src/invite';
import { generateKeys, signHello, type Wire } from '../../client/src/moverecord';
import { OnlineSession } from '../../client/src/session';
import { localPair, type Transport } from '../../client/src/transport';
import { engineVersion, newEncounter, newEngine } from './engine';
import { Session, type EngineLike, type Result, type ToolError } from './game';
import { formatMove, fromRecord, parseMove, toRecord } from './notation';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.error)}`);
  return result.value;
}

function failure(result: Result<unknown>): ToolError {
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
  return result.error;
}

function record(move: string): Int32Array {
  const parsed = parseMove(move);
  if (!parsed.ok) throw new Error(parsed.message);
  return toRecord(parsed.move);
}

/** Real engines, whose game the test can end at once: `end(code)` makes `status()` say that code. */
function endable() {
  let ended = 0;
  const factory = (): EngineLike => {
    const engine = newEngine();
    return new Proxy(engine, {
      get(target, key) {
        if (key === 'status') return () => ended || target.status();
        const member = Reflect.get(target, key);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
  };
  return { factory, end: (code: number) => (ended = code) };
}

/** An agent whose transport is one end of a local pair. `rooms` are the room ids it opened a transport for. */
function agent(factory: () => EngineLike = newEngine) {
  const [mine, theirs] = localPair();
  const rooms: string[] = [];
  const session = new Session(factory, newEncounter, (room) => {
    rooms.push(room);
    return mine;
  });
  return { session, mine, theirs, rooms };
}

/** The browser client's session on the other end, with its own engine: it checks every move the agent sends. */
async function peer(transport: Transport, game: string, side: number) {
  const engine = newEngine();
  const moves: string[] = [];
  const refused: string[] = [];
  const keys = await generateKeys();
  const session = new OnlineSession({
    game,
    side,
    engine: engineVersion(),
    keys,
    transport,
    judge: {
      to_move: () => engine.to_move(),
      play: (mv) => engine.play(mv),
      status: () => engine.status(),
      restart: () => {},
    },
    onMove: (move) => moves.push(formatMove(fromRecord(move))),
    onRefuse: (reason) => refused.push(reason),
  });
  /** Plays `move` on its own engine and sends it signed, as the client does on a click. */
  const play = async (move: string) => {
    const mv = record(move);
    engine.play(mv);
    await session.send(Array.from(mv));
  };
  return { engine, session, moves, refused, play, keys };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('create_room', () => {
  test('opens a room as Black, with an invite link a human opens in the client and the agent key', async () => {
    const { session, rooms } = agent();
    const room = value(await session.createRoom());
    expect(room.room).toMatch(/^[\w-]{8,}$/);
    expect(room.invite).toBe(inviteUrl(SITE, room.room, undefined, await fingerprint(room.pub)));
    expect(room.invite).toMatch(/#room=[\w-]+&key=[\w-]{8}$/);
    expect(room.you).toBe('black');
    expect(room.pub).toMatch(/^[\w-]{43}$/);
    expect(rooms).toEqual([room.room]);
    expect(value(session.getState())).toMatchObject({
      game_id: room.room,
      mode: 'online',
      you: 'black',
      to_move: 'black',
      status: 'running',
      last_moves: [],
      boss: null,
    });
  });

  test('two rooms get two ids, and every room of the process is signed with the same key', async () => {
    const session = new Session(newEngine, newEncounter, () => localPair()[0]);
    const one = value(await session.createRoom());
    value(session.newGame({ bot_nodes: 20 }));
    const two = value(await session.createRoom());
    expect(two.room).not.toBe(one.room);
    expect(two.pub).toBe(one.pub);
  });

  test('waits for a human to take the other seat, then says it is the agent turn with no move yet', async () => {
    const { session, theirs } = agent();
    const { room } = value(await session.createRoom());
    const human = await peer(theirs, room, 2);
    const waited = value(await session.waitForOpponentMove({ timeout_s: 10 }));
    expect(waited).toMatchObject({ event: 'opponent_moved', move: null, state: { you: 'black', to_move: 'black' } });
    // The agent flag is signed in its Hello: the human's client shows the seat as an agent (#255).
    await human.session.settled;
    expect(human.session.role).toBe('player');
    expect(human.session.isAgent(1)).toBe(true);
    expect(human.refused).toEqual([]);
  });

  test('a second room while in one is already_in_room', async () => {
    const { session } = agent();
    value(await session.createRoom());
    expect(failure(await session.createRoom()).code).toBe('already_in_room');
    expect(failure(await session.joinRoom({ room: 'abcdefgh' })).code).toBe('already_in_room');
  });

  test('a transport that cannot start is transport_failed, and the game in progress stays', async () => {
    const session = new Session(newEngine, newEncounter, () => {
      throw new Error('no WebRTC here');
    });
    const local = value(session.newGame({ bot_nodes: 20 }));
    expect(failure(await session.createRoom())).toEqual({ code: 'transport_failed', message: 'Error: no WebRTC here' });
    expect(failure(await session.joinRoom({ room: 'abcdefgh' })).code).toBe('transport_failed');
    expect(value(session.getState()).game_id).toBe(local.game_id);
  });
});

describe('a game against a scripted peer over localPair()', () => {
  async function seated(factory?: () => EngineLike) {
    const a = agent(factory);
    const { room } = value(await a.session.createRoom());
    const human = await peer(a.theirs, room, 2);
    value(await a.session.waitForOpponentMove({ timeout_s: 10 }));
    return { ...a, human };
  }

  test('the agent move is signed and sent, the human move comes back through wait_for_opponent_move', async () => {
    const { session, human } = await seated();
    const played = value(session.playMove({ move: '(1,3)>NE' }));
    expect(played).toMatchObject({ played: '(1,3)>NE', reply: null, state: { to_move: 'white', last_moves: ['(1,3)>NE'] } });
    await vi.waitFor(() => expect(human.moves).toEqual(['(1,3)>NE']));
    expect(failure(session.playMove({ move: '(2,2)>NE' })).code).toBe('not_your_turn');
    expect(value(session.legalMoves()).to_move).toBe('white');

    await human.play('(2,-2)>SE');
    const waited = value(await session.waitForOpponentMove({}));
    expect(waited).toMatchObject({ event: 'opponent_moved', move: '(2,-2)>SE' });
    expect(waited.state).toEqual(value(session.getState()));
    expect(waited.state.last_moves).toEqual(['(1,3)>NE', '(2,-2)>SE']);
    expect(waited.state.board).toBe(Array.from(human.engine.board(), (c) => '.BWx'[c]).join(''));
    // Already the agent's turn: it returns at once with the last move.
    expect(value(await session.waitForOpponentMove({ timeout_s: 1 }))).toMatchObject({ move: '(2,-2)>SE' });
    expect(human.refused).toEqual([]);
  });

  test('a move the engine refuses is illegal_move and is never sent', async () => {
    const { session, human } = await seated();
    expect(failure(session.playMove({ move: '(0,0)>E' })).code).toBe('illegal_move');
    expect(failure(session.playMove({ move: 'nope' })).code).toBe('bad_move');
    value(session.playMove({ move: '(1,3)>NE' }));
    await vi.waitFor(() => expect(human.moves).toEqual(['(1,3)>NE']));
  });

  test('resign online is not_supported until rules.md OPEN-12 is decided', async () => {
    const { session } = await seated();
    expect(failure(session.resign())).toEqual({ code: 'not_supported', message: expect.stringContaining('OPEN-12') });
    expect(value(session.getState())).toMatchObject({ resigned: false, status: 'running' });
  });

  test('an illegal move from the peer is refused by the engine and reported as a desync, the game waits', async () => {
    const { session, human } = await seated();
    value(session.playMove({ move: '(1,3)>NE' }));
    await vi.waitFor(() => expect(human.moves).toHaveLength(1));
    await human.session.send(Array.from(record('(0,0)>E'))); // signed, but no marble there
    const waited = value(await session.waitForOpponentMove({ timeout_s: 10 }));
    expect(waited).toEqual({ event: 'desync', state: value(session.getState()) });
    expect(waited.state).toMatchObject({ to_move: 'white', last_moves: ['(1,3)>NE'] });
    expect(value(await session.waitForOpponentMove({ timeout_s: 1 })).event).toBe('timeout');
  });

  test('the data channel closing is opponent_left, then the wait goes on', async () => {
    const { session, theirs } = await seated();
    value(session.playMove({ move: '(1,3)>NE' }));
    theirs.close();
    expect(value(await session.waitForOpponentMove({ timeout_s: 10 })).event).toBe('opponent_left');
    expect(value(await session.waitForOpponentMove({ timeout_s: 1 })).event).toBe('timeout');
  });

  test('a finished game is game_over at once, and play_move refuses', async () => {
    const engines = endable();
    const { session } = await seated(engines.factory);
    engines.end(2);
    expect(value(await session.waitForOpponentMove({ timeout_s: 10 }))).toMatchObject({
      event: 'game_over',
      state: { status: 'white_won' },
    });
    expect(failure(session.playMove({ move: '(1,3)>NE' })).code).toBe('game_over');
  });

  test('new_game leaves the room: its transport closes, and the wait has no room', async () => {
    const { session, mine } = await seated();
    value(session.newGame({ bot_nodes: 20 }));
    expect(mine.state).toBe('closed');
    expect(value(session.getState())).toMatchObject({ mode: 'bot', you: 'black' });
    expect(failure(await session.waitForOpponentMove({})).code).toBe('no_room');
  });
});

describe('wait_for_opponent_move', () => {
  test('without a room is no_room, a local game included', async () => {
    const session = agent().session;
    expect(failure(await session.waitForOpponentMove({})).code).toBe('no_room');
    value(session.newGame({ bot_nodes: 20 }));
    expect(failure(await session.waitForOpponentMove({})).code).toBe('no_room');
  });

  test('never hangs: with nobody in the room it returns at its timeout', async () => {
    const { session } = agent();
    value(await session.createRoom());
    const started = Date.now();
    const waited = value(await session.waitForOpponentMove({ timeout_s: 1 }));
    expect(waited).toEqual({ event: 'timeout', state: value(session.getState()) });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  test('waits 30 s by default', async () => {
    const { session } = agent();
    value(await session.createRoom());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let done = false;
    const waiting = session.waitForOpponentMove({}).then((result) => {
      done = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(value(await waiting).event).toBe('timeout');
  });
});

describe('join_room', () => {
  test('joins a room a human made, from the invite link, as White', async () => {
    const { session, theirs, rooms } = agent();
    const human = await peer(theirs, 'room-of-a-human', 1);
    const joined = value(await session.joinRoom({ room: inviteUrl(SITE, 'room-of-a-human') }));
    expect(joined).toMatchObject({ room: 'room-of-a-human', invite: inviteUrl(SITE, 'room-of-a-human'), you: 'white' });
    expect(rooms).toEqual(['room-of-a-human']);
    await human.session.settled;
    expect(human.session.isAgent(2)).toBe(true);

    await human.play('(1,3)>NE');
    expect(value(await session.waitForOpponentMove({ timeout_s: 10 }))).toMatchObject({
      event: 'opponent_moved',
      move: '(1,3)>NE',
      state: { you: 'white', to_move: 'white' },
    });
    value(session.playMove({ move: '(2,-2)>SE' }));
    await vi.waitFor(() => expect(human.engine.to_move()).toBe(1));
  });

  test('a link with the creator fingerprint seats the agent when the creator key matches', async () => {
    const { session, theirs } = agent();
    const human = await peer(theirs, 'keyed-room', 1);
    const link = inviteUrl(SITE, 'keyed-room', undefined, await fingerprint(human.keys.pub));
    expect(value(await session.joinRoom({ room: link }))).toMatchObject({ room: 'keyed-room', invite: link, you: 'white' });
  });

  test('a link whose fingerprint is not the key of the first Hello is room_not_found: seat 1 is not bound to it', async () => {
    const [mine, theirs] = localPair();
    const pairs = [localPair()[0], mine];
    const session = new Session(newEngine, newEncounter, () => pairs.shift()!);
    value(await session.createRoom()); // makes the agent key, so the clock below only runs the wait
    value(session.newGame({ bot_nodes: 20 })); // leaves that room
    await peer(theirs, 'keyed-room', 1);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let result: Result<unknown> | undefined;
    void session.joinRoom({ room: inviteUrl(SITE, 'keyed-room', undefined, 'AAAAAAAA') }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(failure(result!).code).toBe('room_not_found');
  });

  test('takes a bare room code too', async () => {
    const { session, theirs, rooms } = agent();
    await peer(theirs, 'abc_DEF-123', 1);
    expect(value(await session.joinRoom({ room: 'abc_DEF-123' })).you).toBe('white');
    expect(rooms).toEqual(['abc_DEF-123']);
  });

  test('a room whose two seats are taken is room_full, and the agent leaves it', async () => {
    const { session, mine, theirs } = agent();
    const creator = await generateKeys();
    const other = await generateKeys();
    theirs.onRecord((message: Wire) => {
      if ((message as { kind?: string }).kind !== 'hello') return;
      void signHello(creator, { game: 'full', seat: 1, roster: [creator.pub, other.pub], engine: engineVersion() }).then((h) => theirs.send(h));
    });
    expect(failure(await session.joinRoom({ room: 'full' })).code).toBe('room_full');
    expect(mine.state).toBe('closed');
    expect(failure(session.getState()).code).toBe('no_game');
  });

  test('no answer within 30 s is room_not_found, the agent leaves, and the game in progress stays', async () => {
    const opened: Transport[] = [];
    const session = new Session(newEngine, newEncounter, () => {
      opened.push(localPair()[0]); // nobody on the other end
      return opened.at(-1)!;
    });
    value(await session.createRoom()); // makes the agent key, so the clock below only runs the wait
    const local = value(session.newGame({ bot_nodes: 20 }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let result: Result<unknown> | undefined;
    void session.joinRoom({ room: 'nobody-here' }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(failure(result!).code).toBe('room_not_found');
    expect(opened[1]!.state).toBe('closed');
    expect(value(session.getState()).game_id).toBe(local.game_id);
  });

  test('a link without a room is room_not_found', async () => {
    const { session, rooms } = agent();
    expect(failure(await session.joinRoom({ room: 'https://tidymaze.github.io/ab-alone/#daily' }))).toEqual({
      code: 'room_not_found',
      message: expect.stringContaining('#daily'),
    });
    expect(failure(await session.joinRoom({ room: '' })).code).toBe('room_not_found');
    expect(rooms).toEqual([]);
  });
});

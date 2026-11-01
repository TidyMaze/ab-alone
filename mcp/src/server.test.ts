import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, test } from 'vitest';
import { localPair } from '../../client/src/transport';
import { newEncounter, newEngine } from './engine';
import { Session } from './game';
import { createServer, toolResult } from './server';
import type { PeerNet } from '../../client/src/p2p';
import { encodeHello, encodePos } from '../../client/src/worldpeers';
import { bossIds, worldRules } from './engine';
import { OpenWorld } from './world';
import { WorldRoom } from './worldroom';

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** A client connected in memory to a fresh server, as an MCP host would be over stdio. Its rooms are local pairs. */
async function connect(room?: WorldRoom, world?: OpenWorld, encounter: typeof newEncounter = newEncounter): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(new Session(newEngine, encounter, () => localPair()[0]), world, room).connect(serverSide);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

/** The text of a tool result: the JSON of the output, or of the error. */
function text(result: unknown): string {
  const { content } = result as { content: { type: string; text: string }[] };
  expect(content).toHaveLength(1);
  expect(content[0]!.type).toBe('text');
  return content[0]!.text;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client!.callTool({ name, arguments: args });
  return { isError: result.isError === true, text: text(result) };
}

describe('toolResult', () => {
  test('a value is its JSON as text content', () => {
    expect(toolResult({ ok: true, value: { a: [1, null] } })).toEqual({ content: [{ type: 'text', text: '{"a":[1,null]}' }] });
  });

  test('an error is the error object as JSON, with isError set', () => {
    expect(toolResult({ ok: false, error: { code: 'no_game', message: 'm' } })).toEqual({
      isError: true,
      content: [{ type: 'text', text: '{"code":"no_game","message":"m"}' }],
    });
  });
});

describe('the Open world tools', () => {
  test('start a world, read it, step and walk, with errors as tool errors', async () => {
    await connect();
    expect((await call('world_state')).isError).toBe(true);
    const started = JSON.parse((await call('new_world', { seed: 3 })).text);
    expect(started.hero).toBe('(0,0)');
    expect(started.window.radius).toBe(3);
    expect(JSON.parse((await call('world_state', { radius: 5 })).text).window.radius).toBe(5);
    expect(JSON.parse((await call('world_step', { direction: 'E' })).text).state.hero).toBe('(1,0)');
    expect(JSON.parse((await call('world_walk', { q: 4, r: 0 })).text).steps).toBe(3);
    const refused = await call('world_walk', { q: 4, r: 0 });
    expect(refused.isError).toBe(true);
    expect(JSON.parse(refused.text).code).toBe('no_path');
    expect((await call('world_step', { direction: 'UP' })).isError).toBe(true);
  });

  test("save the world and resume it, in the client's save format, a bad save refused", async () => {
    await connect();
    await call('new_world', { seed: 3 });
    await call('world_step', { direction: 'E' });
    const save = JSON.parse((await call('save_world')).text);
    expect(save).toMatchObject({ record: 4, seed: 3, hero: [1, 0], lairs: [] });
    await call('new_world', { seed: 0 });
    // The cells discovered come back too (#1411): the spawn's disc and the 21 cells the step uncovered.
    expect(JSON.parse((await call('new_world', { save })).text)).toMatchObject({ seed: 3, hero: '(1,0)', discovered: 352 });
    expect(JSON.parse((await call('new_world', { save: { ...save, discovered: [[0, 0, '!!']] } })).text).code).toBe('bad_save');
    expect((await call('new_world', { save: { ...save, hero: [1] } })).isError).toBe(true);
    const stale = await call('new_world', { save: { ...save, version: save.version + 1 } });
    expect(JSON.parse(stale.text).code).toBe('bad_save');
  });

  test("the fight of a lair is the session's game: won after the step onto the lair, it beats the lair", async () => {
    // Every fight of this server is won as it starts: the boss encounter says Black won.
    const won = (boss: string, seed: number) => {
      const encounter = newEncounter(boss, seed);
      return Object.assign(Object.create(encounter), { status: () => 1 }) as ReturnType<typeof newEncounter>;
    };
    await connect(undefined, undefined, won);
    const [q, r] = worldRules().world_lairs(3);
    const save = JSON.parse((await call('new_world', { seed: 3 }), await call('save_world')).text);
    await call('new_world', { save: { ...save, hero: [q! - 1, r!], troop: [] } });
    const { lair } = JSON.parse((await call('world_step', { direction: 'E' })).text);
    expect(lair).toMatchObject({ index: 0, boss: bossIds()[0] });
    expect(JSON.parse((await call('world_state')).text).lairs[0].beaten).toBe(false);
    await call('new_game', { boss: lair.boss });
    expect(JSON.parse((await call('world_state')).text).lairs[0].beaten).toBe(true);
  });
});

describe('the public Open world tools (#1365)', () => {
  /** A room over a fake PeerNet: `say` makes a peer talk, `sent` is what the browsers would receive. */
  function room() {
    const sent: Uint8Array[] = [];
    let data: (bytes: Uint8Array, peer: string) => void = () => {};
    const net: PeerNet = { send: (bytes) => void sent.push(bytes), onData: (cb) => (data = cb), onJoin: () => {}, onLeave: () => {}, onError: () => {}, close: () => {} };
    const world = new OpenWorld(worldRules(), bossIds);
    return { world, sent, say: (peer: string, bytes: Uint8Array) => data(bytes, peer), worldRoom: new WorldRoom(world, worldRules(), () => net, { sleep: async () => {} }) };
  }

  test('join, list the heroes, walk to one, leave: each a tool, errors as tool errors', async () => {
    const { world, say, worldRoom, sent } = room();
    await connect(worldRoom, world);
    expect((await call('world_heroes')).isError).toBe(true);
    expect(JSON.parse((await call('world_heroes')).text).code).toBe('no_world_room');
    const joined = JSON.parse((await call('join_world_room', { name: 'Claude' })).text);
    expect(joined).toMatchObject({ room: 'ow:1305:0', name: 'Claude', hero: '(0,0)' });
    expect(JSON.parse((await call('join_world_room')).text).code).toBe('already_in_world_room');
    say('p', encodeHello('Ada'));
    say('p', encodePos(1, 0, 1));
    expect(JSON.parse((await call('world_heroes')).text).heroes).toEqual([{ id: 'p', name: 'Ada', cell: '(1,0)', distance: 1 }]);
    expect(JSON.parse((await call('world_visit', { hero: 'p' })).text)).toMatchObject({ steps: 0, arrived: true });
    expect(JSON.parse((await call('world_visit', {})).text).code).toBe('bad_target');
    expect((await call('world_visit', { hero: 'p', q: 1 })).isError).toBe(false); // a hero wins over a cell
    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.parse((await call('leave_world_room')).text)).toEqual({ left: true });
  });
});

describe('a server with no peer transport (#1365)', () => {
  test('joining the public world room is a transport error, not a crash', async () => {
    await connect();
    const result = await call('join_world_room');
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.text).code).toBe('transport_failed');
  });
});

describe('the MCP server', () => {
  test('lists the tools of a local game and of an online room, with their input schemas', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'new_game',
      'get_state',
      'legal_moves',
      'play_move',
      'resign',
      'create_room',
      'join_room',
      'wait_for_opponent_move',
      'new_world',
      'world_state',
      'save_world',
      'world_step',
      'world_walk',
      'join_world_room',
      'world_heroes',
      'world_visit',
      'leave_world_room',
    ]);
    for (const tool of tools) expect(tool.description).toBeTruthy();
    const schema = (name: string) => tools.find((tool) => tool.name === name)!.inputSchema;
    expect(schema('new_game')).toMatchObject({
      type: 'object',
      properties: {
        boss: { type: 'string' },
        seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
        bot_nodes: { type: 'integer', minimum: 1, maximum: 200000 },
      },
      additionalProperties: false,
    });
    // The boss ids come from the engine (boss_ids()), so a host sees them without a call.
    expect(tools.find((tool) => tool.name === 'new_game')!.inputSchema.properties!.boss).toMatchObject({
      description: expect.stringContaining('echo, hull, choir, chaplain'),
    });
    expect(schema('new_game').required ?? []).toEqual([]);
    expect(schema('play_move')).toMatchObject({
      type: 'object',
      properties: { move: { type: 'string' } },
      required: ['move'],
      additionalProperties: false,
    });
    for (const name of ['get_state', 'legal_moves', 'resign']) {
      expect(schema(name)).toMatchObject({ type: 'object', properties: {} });
    }
    expect(schema('create_room')).toMatchObject({
      type: 'object',
      properties: { boss: { type: 'string' }, seed: { type: 'integer', minimum: 0 } },
      additionalProperties: false,
    });
    expect(schema('create_room').required ?? []).toEqual([]);
    expect(schema('join_room')).toMatchObject({
      type: 'object',
      properties: { room: { type: 'string' } },
      required: ['room'],
      additionalProperties: false,
    });
    expect(schema('wait_for_opponent_move')).toMatchObject({
      type: 'object',
      properties: { timeout_s: { type: 'integer', minimum: 1, maximum: 120 } },
      additionalProperties: false,
    });
    expect(schema('wait_for_opponent_move').required ?? []).toEqual([]);
  });

  test('a tool error is the error object of the spec, as JSON', async () => {
    await connect();
    for (const name of ['get_state', 'legal_moves', 'resign']) {
      const result = await call(name);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.text)).toEqual({ code: 'no_game', message: expect.any(String) });
    }
    const result = await call('play_move', { move: '(1,3)>NE' });
    expect(JSON.parse(result.text).code).toBe('no_game');
  });

  test('plays a game through every tool', async () => {
    await connect();
    const started = await call('new_game', { bot_nodes: 20 });
    expect(started.isError).toBe(false);
    expect(JSON.parse(started.text)).toMatchObject({ mode: 'bot', you: 'black', status: 'running' });

    const legal = JSON.parse((await call('legal_moves')).text);
    expect(legal.moves).toContain('(1,3)>NE');

    const played = JSON.parse((await call('play_move', { move: '(1,3)>NE' })).text);
    expect(played).toMatchObject({ played: '(1,3)>NE', reply: expect.any(String), bonuses: [] });
    expect(JSON.parse((await call('get_state')).text)).toEqual(played.state);

    const bad = await call('play_move', { move: '(1,3)>ne' });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.text)).toEqual({ code: 'bad_move', message: 'direction must be E, W, NE, SW, NW or SE' });

    const resigned = JSON.parse((await call('resign')).text);
    expect(resigned).toMatchObject({ status: 'white_won', resigned: true });
    expect(JSON.parse((await call('play_move', { move: '(1,3)>NE' })).text).code).toBe('game_over');
  });

  test('fights a boss: the boss object in the state, its reply in play_move, unknown_boss for a bad id', async () => {
    await connect();
    const started = JSON.parse((await call('new_game', { boss: 'echo', seed: 1 })).text);
    expect(started).toMatchObject({ mode: 'boss', boss: { id: 'echo', name: 'The Echo', tell: null, result: 'playing' } });
    expect(JSON.parse((await call('legal_moves')).text).announces['(1,3)>NE']).toBe('(-1,-3)>SW');
    const played = JSON.parse((await call('play_move', { move: '(1,3)>NE' })).text);
    // The announced mirror is the Echo's bonus move, played inside the move (#859); the reply is its own search move, and
    // its mirror is offered to us as a free move (#958).
    expect(played).toMatchObject({
      played: '(1,3)>NE',
      reply: '(-2,-2)>E',
      bonuses: ['(-1,-3)>SW'],
      state: { mode: 'boss' },
    });
    expect(JSON.parse((await call('legal_moves')).text).free).toEqual(['(2,2)>W']);
    const unknown = await call('new_game', { boss: 'nope' });
    expect(unknown.isError).toBe(true);
    expect(JSON.parse(unknown.text)).toEqual({ code: 'unknown_boss', message: 'unknown boss nope' });
  });

  test('opens a room and waits in it through the online tools', async () => {
    await connect();
    expect(JSON.parse((await call('wait_for_opponent_move')).text).code).toBe('no_room');
    const room = JSON.parse((await call('create_room')).text);
    expect(room).toMatchObject({ you: 'black', invite: expect.stringContaining(`#room=${room.room}`) });
    expect(JSON.parse((await call('get_state')).text)).toMatchObject({ mode: 'online', game_id: room.room });
    const again = await call('join_room', { room: room.invite });
    expect(again.isError).toBe(true);
    expect(JSON.parse(again.text).code).toBe('already_in_room');
    expect(JSON.parse((await call('resign')).text).code).toBe('not_supported');
    const waited = JSON.parse((await call('wait_for_opponent_move', { timeout_s: 1 })).text);
    expect(waited).toMatchObject({ event: 'timeout', state: { mode: 'online' } });
    for (const timeout_s of [0, 121, 1.5]) {
      const result = await call('wait_for_opponent_move', { timeout_s });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('timeout_s');
    }
  });

  test('create_room with a boss opens a duel whose invite names the boss and the boss seat (#1316)', async () => {
    await connect();
    const room = JSON.parse((await call('create_room', { boss: 'hull', seed: 5 })).text);
    expect(room.invite).toContain(`#room=${room.room}&boss=hull&seed=5&seat=boss&key=`);
    expect(JSON.parse((await call('get_state')).text)).toMatchObject({ mode: 'online', boss: { id: 'hull' } });
  });

  test('new_game with no argument plays against the default bot', async () => {
    await connect();
    const result = await call('new_game');
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text).status).toBe('running');
  });

  test('arguments outside the input schema are refused before the game sees them', async () => {
    await connect();
    for (const bot_nodes of [0, 200001, 1.5]) {
      const result = await call('new_game', { bot_nodes });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('bot_nodes');
    }
    for (const seed of [-1, 4294967296, 0.5]) {
      const result = await call('new_game', { boss: 'echo', seed });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('seed');
    }
    expect((await call('play_move', {})).isError).toBe(true);
    expect((await call('get_state')).isError).toBe(true);
  });
});

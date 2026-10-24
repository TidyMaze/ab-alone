import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, test } from 'vitest';
import { newEngine } from './engine';
import { Session } from './game';
import { createServer, toolResult } from './server';

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** A client connected in memory to a fresh server, as an MCP host would be over stdio. */
async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(new Session(newEngine)).connect(serverSide);
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

describe('the MCP server', () => {
  test('lists the five tools of a local game, with their input schemas', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['new_game', 'get_state', 'legal_moves', 'play_move', 'resign']);
    for (const tool of tools) expect(tool.description).toBeTruthy();
    const schema = (name: string) => tools.find((tool) => tool.name === name)!.inputSchema;
    expect(schema('new_game')).toMatchObject({
      type: 'object',
      properties: { bot_nodes: { type: 'integer', minimum: 1, maximum: 200000 } },
      additionalProperties: false,
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
    expect(played).toMatchObject({ played: '(1,3)>NE', reply: expect.any(String) });
    expect(JSON.parse((await call('get_state')).text)).toEqual(played.state);

    const bad = await call('play_move', { move: '(1,3)>ne' });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.text)).toEqual({ code: 'bad_move', message: 'direction must be E, W, NE, SW, NW or SE' });

    const resigned = JSON.parse((await call('resign')).text);
    expect(resigned).toMatchObject({ status: 'white_won', resigned: true });
    expect(JSON.parse((await call('play_move', { move: '(1,3)>NE' })).text).code).toBe('game_over');
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
    // Bosses come with #253: until then a boss field is an error, never a silent game against the bot.
    expect((await call('new_game', { boss: 'echo' })).isError).toBe(true);
    expect((await call('play_move', {})).isError).toBe(true);
    expect((await call('get_state')).isError).toBe(true);
  });
});

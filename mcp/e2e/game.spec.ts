import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** Starts the server the way an MCP host does (README, "Let an AI agent play"): a child process on stdio. */
async function start(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'bun',
    args: ['src/main.ts'],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stderr: 'inherit',
  });
  client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client!.callTool({ name, arguments: args });
  const [content] = result.content as { type: 'text'; text: string }[];
  return { isError: result.isError === true, value: JSON.parse(content!.text) };
}

/** A fixed pseudo-random sequence, so the scripted agent plays the same game on every run. */
function picker(seed: number) {
  let state = seed;
  return (count: number) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state % count;
  };
}

test('a scripted client plays a full game against the bot over stdio', async () => {
  await start();
  const { tools } = await client!.listTools();
  expect(tools.map((tool) => tool.name).sort()).toEqual(['get_state', 'legal_moves', 'new_game', 'play_move', 'resign']);

  // A small bot budget keeps the run short. The default budget is the client's (unit tests).
  let state = (await call('new_game', { bot_nodes: 300 })).value;
  expect(state).toMatchObject({ mode: 'bot', you: 'black', to_move: 'black', status: 'running' });

  const pick = picker(252);
  let plies = 0;
  while (state.status === 'running') {
    const legal = (await call('legal_moves')).value;
    expect(legal.count).toBeGreaterThan(0);
    const move = legal.moves[pick(legal.count)];
    const answer = await call('play_move', { move });
    expect(answer.isError).toBe(false);
    expect(answer.value.played).toBe(move);
    plies += answer.value.reply === null ? 1 : 2;
    state = answer.value.state;
    expect(state.last_moves.at(-1)).toBe(answer.value.reply ?? move);
  }

  expect(['black_won', 'white_won', 'draw']).toContain(state.status);
  expect(plies).toBeGreaterThan(1);
  expect((await call('get_state')).value).toEqual(state);
  expect((await call('legal_moves')).value.moves).toEqual([]);
  const late = await call('play_move', { move: '(1,3)>NE' });
  expect(late).toEqual({ isError: true, value: { code: 'game_over', message: expect.any(String) } });

  // Then a second game, resigned at once.
  const fresh = (await call('new_game')).value;
  expect(fresh.game_id).not.toBe(state.game_id);
  expect((await call('resign')).value).toMatchObject({ status: 'white_won', resigned: true });
});

test('a scripted client fights a boss to the end over stdio', async () => {
  await start();
  let state = (await call('new_game', { boss: 'hull', seed: 253 })).value;
  expect(state).toMatchObject({ mode: 'boss', you: 'black', status: 'running', boss: { id: 'hull', result: 'playing' } });

  const pick = picker(253);
  let cracks = 0;
  while (state.status === 'running') {
    const legal = (await call('legal_moves')).value;
    expect(legal.announces).toEqual({});
    const answer = await call('play_move', { move: legal.moves[pick(legal.count)] });
    expect(answer.isError).toBe(false);
    state = answer.value.state;
    cracks += state.boss.marks.filter((mark: { kind: string }) => mark.kind === 'crack').length;
  }

  // The Hull cracks cells on its schedule, and a fight always ends won or lost, a draw is a loss.
  expect(cracks).toBeGreaterThan(0);
  expect(['won', 'lost']).toContain(state.boss.result);
  expect(state.boss.result).toBe(state.status === 'black_won' ? 'won' : 'lost');
  expect((await call('get_state')).value).toEqual(state);
});

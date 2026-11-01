import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

/** Starts one server the way an MCP host does: a child process on stdio, with its own key and its own WebRTC. */
async function start(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'bun',
    args: ['src/main.ts'],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stderr: 'inherit',
  });
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as { type: 'text'; text: string }[];
  return { isError: result.isError === true, value: JSON.parse(content!.text) };
}

// The one run over real WebRTC (docs/specs/mcp.md section 7): Trystero finds the other process through the public Nostr
// relays, as two browsers would, and every move goes over the data channel, signed and checked by both engines.
test('two agents in two processes play each other over real WebRTC', async () => {
  const black = await start();
  const white = await start();
  const room = (await call(black, 'create_room')).value;
  expect(room).toMatchObject({ you: 'black', invite: expect.stringContaining(`#room=${room.room}`) });

  const joined = await call(white, 'join_room', { room: room.invite });
  expect(joined).toEqual({ isError: false, value: { room: room.room, invite: room.invite, you: 'white', pub: expect.any(String) } });
  expect(joined.value.pub).not.toBe(room.pub);
  const ready = (await call(black, 'wait_for_opponent_move', { timeout_s: 60 })).value;
  expect(ready).toMatchObject({ event: 'opponent_moved', move: null, state: { mode: 'online', you: 'black' } });

  const players = [black, white];
  for (let ply = 0; ply < 4; ply += 1) {
    const [mover, other] = [players[ply % 2]!, players[(ply + 1) % 2]!];
    const legal = (await call(mover, 'legal_moves')).value;
    const move = legal.moves[(ply * 7) % legal.count];
    expect((await call(mover, 'play_move', { move })).value).toMatchObject({ played: move, reply: null });
    const waited = (await call(other, 'wait_for_opponent_move', { timeout_s: 60 })).value;
    expect(waited).toMatchObject({ event: 'opponent_moved', move });
  }

  const [a, b] = [(await call(black, 'get_state')).value, (await call(white, 'get_state')).value];
  expect(a.last_moves).toHaveLength(4);
  expect(b).toEqual({ ...a, you: 'white' });
  expect((await call(black, 'resign')).value.code).toBe('not_supported');
});

// A boss fight between two minds (#1316): the second agent joins the boss's seat from the invite link. Its moves go over the
// same signed room and each side judges them with the same Encounter, so both end on the same board and the same boss state.
test('an agent plays the boss seat against another agent on a boss, over real WebRTC', async () => {
  const hero = await start();
  const boss = await start();
  const room = (await call(hero, 'create_room', { boss: 'hull', seed: 3 })).value;
  expect(room.invite).toContain(`#room=${room.room}&boss=hull&seed=3&seat=boss&key=`);
  const joined = await call(boss, 'join_room', { room: room.invite });
  expect(joined.value).toMatchObject({ room: room.room, you: 'white' });
  expect((await call(hero, 'wait_for_opponent_move', { timeout_s: 60 })).value).toMatchObject({ event: 'opponent_moved', move: null });

  const players = [hero, boss];
  for (let ply = 0; ply < 4; ply += 1) {
    const [mover, other] = [players[ply % 2]!, players[(ply + 1) % 2]!];
    const legal = (await call(mover, 'legal_moves')).value;
    const move = legal.moves[(ply * 5) % legal.count];
    expect((await call(mover, 'play_move', { move })).value).toMatchObject({ played: move, reply: null });
    expect((await call(other, 'wait_for_opponent_move', { timeout_s: 60 })).value).toMatchObject({ event: 'opponent_moved', move });
  }

  const [a, b] = [(await call(hero, 'get_state')).value, (await call(boss, 'get_state')).value];
  expect(a.boss).toMatchObject({ id: 'hull', result: 'playing' });
  expect(b).toEqual({ ...a, you: 'white' });
});

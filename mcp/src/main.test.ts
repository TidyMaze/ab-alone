import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { RTCPeerConnection } from 'werift';
import { afterAll, describe, expect, test, vi } from 'vitest';

// main.ts started as an MCP host would start it, with its stdio swapped for one end of an in-memory pair, and the
// browser client's Trystero transport replaced by a spy that fails: no relay, no WebRTC.
const io = vi.hoisted(() => ({ server: undefined as unknown, rooms: [] as string[] }));
vi.mock('@modelcontextprotocol/server/stdio', () => ({
  StdioServerTransport: function StdioServerTransport() {
    return io.server;
  },
}));
vi.mock('../../client/src/p2p', () => ({
  p2pTransport: (room: string) => {
    io.rooms.push(room);
    throw new Error('no relay in the unit tests');
  },
}));

const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
io.server = serverSide;
await import('./main');
const client = new Client({ name: 'test', version: '0.0.0' });
await client.connect(clientSide);
afterAll(() => client.close());

describe('main', () => {
  test('serves the game tools over its stdio', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('new_game');
  });

  test('gives Trystero the WebRTC of werift, which Node lacks', () => {
    expect((globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection).toBe(RTCPeerConnection);
  });

  test("opens online rooms over the browser client's Trystero transport", async () => {
    const result = await client.callTool({ name: 'create_room', arguments: {} });
    expect(result.isError).toBe(true);
    expect(io.rooms).toHaveLength(1);
    expect((result.content as { text: string }[])[0]!.text).toContain('transport_failed');
  });
});

// The MCP server: the tools of docs/specs/mcp.md section 5 over one Session. Every tool returns JSON as text content,
// a failure sets `isError` with the error object of section 6.
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { Result, Session } from './game';

const NOTATION =
  'A move is the selected cells, then ">", then the direction: "(-1,2)(0,2)>E", "(0,0)>SE". A cell is (q,r). ' +
  'Directions: E, W, NE, SW, NW, SE.';

export function toolResult(result: Result<unknown>): CallToolResult {
  return result.ok
    ? { content: [{ type: 'text', text: JSON.stringify(result.value) }] }
    : { isError: true, content: [{ type: 'text', text: JSON.stringify(result.error) }] };
}

export function createServer(session: Session): McpServer {
  const server = new McpServer({ name: 'ab-alone', version: '0.1.0' });

  server.registerTool(
    'new_game',
    {
      description:
        'Start a local game of Abalone against the bot and drop any game in progress. You are Black and move ' +
        'first. Returns the game state (see get_state).',
      inputSchema: z.strictObject({
        bot_nodes: z
          .int()
          .min(1)
          .max(200000)
          .optional()
          .describe('Positions the bot searches per move, default 20000. Fewer is weaker and faster.'),
      }),
    },
    (input) => toolResult(session.newGame(input)),
  );

  server.registerTool(
    'get_state',
    {
      description:
        'The game state: side to move, status (running, black_won, white_won, draw), marbles ejected by each side ' +
        'and the number needed to win, the board as ASCII and as 61 characters, and the last 6 plies.',
    },
    () => toolResult(session.getState()),
  );

  server.registerTool(
    'legal_moves',
    { description: `Every legal move of the side to move, from the engine. Empty once the game is over. ${NOTATION}` },
    () => toolResult(session.legalMoves()),
  );

  server.registerTool(
    'play_move',
    {
      description:
        'Play your move. The engine refuses an illegal one and nothing changes. The bot replies in the same call, ' +
        `so you are to move again unless the game is over. ${NOTATION}`,
      inputSchema: z.strictObject({ move: z.string().describe('Your move, for example "(1,3)>NE".') }),
    },
    (input) => toolResult(session.playMove(input)),
  );

  server.registerTool(
    'resign',
    { description: 'Give up the game: the bot wins.' },
    () => toolResult(session.resign()),
  );

  return server;
}

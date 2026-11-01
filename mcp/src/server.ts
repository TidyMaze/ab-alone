// The MCP server: the tools of docs/specs/mcp.md section 5 over one Session, a local game or an online room. Every
// tool returns JSON as text content, a failure sets `isError` with the error object of section 6.
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { bossIds, worldRules } from './engine';
import type { Result, Session } from './game';
import { OpenWorld } from './world';

const NOTATION =
  'A move is the selected cells, then ">", then the direction: "(-1,2)(0,2)>E", "(0,0)>SE". A cell is (q,r). ' +
  'Directions: E, W, NE, SW, NW, SE.';

export function toolResult(result: Result<unknown>): CallToolResult {
  return result.ok
    ? { content: [{ type: 'text', text: JSON.stringify(result.value) }] }
    : { isError: true, content: [{ type: 'text', text: JSON.stringify(result.error) }] };
}

const WINDOW =
  'The window is a hex of cells round the hero, one row per r, each row from the cell q0 along q. H hero, T troop, E enemy, L lair, ' +
  '? off the world, else the terrain: ~ water, s sand, g grass, r rock, P peak, o boulder, t tree, W wall. Water, peaks, walls, ' +
  'enemies and lairs cannot be entered; a boulder, or a tree with no tree beside it, is broken by rolling into it.';

export function createServer(session: Session, world: OpenWorld = new OpenWorld(worldRules(), bossIds)): McpServer {
  const server = new McpServer({ name: 'ab-alone', version: '0.1.0' });

  server.registerTool(
    'new_game',
    {
      description:
        'Start a local game of Abalone against the bot, or a boss fight, and drop any game in progress. You are ' +
        'Black and move first. Returns the game state (see get_state).',
      inputSchema: z.strictObject({
        boss: z
          .string()
          .optional()
          .describe(`Fight this boss instead of the bot: ${bossIds().join(', ')}. Same boss and seed, same fight.`),
        seed: z.int().min(0).max(4294967295).optional().describe('Seed of the boss fight, default 0.'),
        bot_nodes: z
          .int()
          .min(1)
          .max(200000)
          .optional()
          .describe('Positions the bot searches per move, default 20000. Fewer is weaker and faster. Not for a boss.'),
      }),
    },
    (input) => toolResult(session.newGame(input)),
  );

  server.registerTool(
    'get_state',
    {
      description:
        'The game state: mode (bot, boss, online), your side, side to move, status (running, black_won, white_won, ' +
        'draw), marbles ejected by each side and the number needed to win, the board as ASCII and as 61 characters (91 or 169 on a larger boss board), ' +
        'the last 6 plies, and in a boss fight the boss: phase, tell (what it does after the next ply), marks on the ' +
        'board, result.',
    },
    () => toolResult(session.getState()),
  );

  server.registerTool(
    'legal_moves',
    {
      description:
        'Every legal move of the side to move, from the engine. Empty once the game is over. announces maps a move to ' +
        `the reply a boss announces for it, empty when it announces nothing. ${NOTATION}`,
    },
    () => toolResult(session.legalMoves()),
  );

  server.registerTool(
    'play_move',
    {
      description:
        'Play your move. The engine refuses an illegal one and nothing changes. The bot or boss replies in the ' +
        'same call, so you are to move again unless the game is over. Online, the move is sent to your opponent: ' +
        `call wait_for_opponent_move for the reply. ${NOTATION}`,
      inputSchema: z.strictObject({ move: z.string().describe('Your move, for example "(1,3)>NE".') }),
    },
    (input) => toolResult(session.playMove(input)),
  );

  server.registerTool(
    'resign',
    { description: 'Give up the game: the bot or boss wins. Not supported online yet.' },
    () => toolResult(session.resign()),
  );

  server.registerTool(
    'create_room',
    {
      description:
        'Open an online room and take its first seat: you are Black. Send the invite link to a human, who opens ' +
        'it in a browser, or the room code to another agent (join_room). Then call wait_for_opponent_move: it ' +
        'returns once the opponent is seated and it is your turn. With boss, the room is a boss fight and the ' +
        'opponent plays the boss as White: the invite link names the boss, and join_room seats the other agent as ' +
        'the boss. Drops any game in progress.',
      inputSchema: z.strictObject({
        boss: z.string().optional().describe(`Fight this boss, played by the opponent: ${bossIds().join(', ')}.`),
        seed: z.int().min(0).max(4294967295).optional().describe('Seed of the boss fight, default 0.'),
      }),
    },
    async (input) => toolResult(await session.createRoom(input)),
  );

  server.registerTool(
    'join_room',
    {
      description:
        'Join an online room a human or another agent opened, from its invite link or its room code. You are ' +
        'White: call wait_for_opponent_move for Black\'s first move. If the link is a boss fight, you play the boss: ' +
        'get_state shows the boss, legal_moves lists your moves, and the boss rules judge them. Drops any game in progress.',
      inputSchema: z.strictObject({ room: z.string().describe('The invite link or the room code.') }),
    },
    async (input) => toolResult(await session.joinRoom(input)),
  );

  server.registerTool(
    'wait_for_opponent_move',
    {
      description:
        'Online: wait until it is your turn, then return the opponent move (event opponent_moved, move null ' +
        'before the first move), or game_over, opponent_left (it may come back), desync (the opponent sent a ' +
        'move that was refused, the game waits), or timeout. Never waits longer than timeout_s.',
      inputSchema: z.strictObject({
        timeout_s: z.int().min(1).max(120).optional().describe('Seconds to wait at most, default 30.'),
      }),
    },
    async (input) => toolResult(await session.waitForOpponentMove(input)),
  );

  server.registerTool(
    'new_world',
    {
      description:
        'Start the Open world of a seed and drop the world in progress: the hero on the spawn (0,0), the troop round it. Same seed, ' +
        'same world as the client. Returns the world state (see world_state). Walk to a lair and step onto it, then fight its boss ' +
        `with new_game. ${WINDOW}`,
      inputSchema: z.strictObject({ seed: z.int().min(0).max(4294967295).optional().describe('Seed of the world, default 0.') }),
    },
    (input) => toolResult(world.newWorld(input)),
  );

  server.registerTool(
    'world_state',
    {
      description:
        'The Open world state: seed, hero, troop, obstacles broken, the enemies in the window, every boss lair with its distance ' +
        `from the hero, and a short window of cells round the hero (never the whole map). ${WINDOW}`,
      inputSchema: z.strictObject({ radius: z.int().min(1).max(8).optional().describe('Cells of the window out from the hero, default 3.') }),
    },
    (input) => toolResult(world.state(input)),
  );

  server.registerTool(
    'world_step',
    {
      description:
        'Roll the hero one cell. Refused (blocked) by water, a peak, a wall, an enemy or an unbreakable tree, and nothing changes. ' +
        'Onto a lair the hero stays, moved is false and lair names the boss: start that fight with new_game.',
      inputSchema: z.strictObject({ direction: z.enum(['E', 'W', 'NE', 'SW', 'NW', 'SE']).describe('Direction of the step.') }),
    },
    (input) => toolResult(world.step(input)),
  );

  server.registerTool(
    'world_walk',
    {
      description:
        'Walk the hero to a cell, round the obstacles and the enemies, by the shortest path of the engine, up to 40 cells away. ' +
        'no_path when there is none (the hero cell, a lair, an enemy, off the world, too far, walled in).',
      inputSchema: z.strictObject({ q: z.int().describe('Column of the cell.'), r: z.int().describe('Row of the cell.') }),
    },
    (input) => toolResult(world.walk(input)),
  );

  return server;
}

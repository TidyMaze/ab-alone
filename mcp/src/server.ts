// The MCP server: the tools of docs/specs/mcp.md section 5 over one Session, a local game or an online room. Every
// tool returns JSON as text content, a failure sets `isError` with the error object of section 6.
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { bossIds, worldRules } from './engine';
import type { Result, Session } from './game';
import { OpenWorld } from './world';
import { refusePeers, WorldRoom } from './worldroom';

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
  'enemies and lairs cannot be entered; a boulder, or a tree with no tree beside it, is broken by rolling into it. After each step ' +
  'the troop attacks on its own, as in the client: it plays the best legal push against the enemies near the hero, and an enemy ' +
  'pushed into water or off the world is ejected (beaten).';

const CELL = z.tuple([z.int(), z.int()]);

/** A world save in the client's format (client/src/openworldsave.ts), as save_world gives it. */
const SAVE = z.object({
  version: z.int(),
  seed: z.int().min(0).max(4294967295),
  hero: CELL,
  troop: z.array(CELL).max(6),
  fight: z.object({ removed: z.array(z.string().regex(/^-?\d+,-?\d+$/)), added: z.array(CELL), beaten: z.int().min(0) }),
  yaw: z.number(),
  broken: z.array(CELL),
  lairs: z.array(z.int().min(0)),
});

export function createServer(
  session: Session,
  world: OpenWorld = new OpenWorld(worldRules(), bossIds, session),
  worldRoom: WorldRoom = new WorldRoom(world, worldRules(), refusePeers),
): McpServer {
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
        'Start the Open world of a seed and drop the world in progress: the hero on the spawn (0,0), the troop round it, or resume a ' +
        'save. Same seed, same world and the same moves give the same result as the client. Returns the world state (see world_state). ' +
        'Walk to a lair and step onto it, then fight its boss with new_game: a fight won marks the lair beaten when you are back in the ' +
        `world. ${WINDOW}`,
      inputSchema: z.strictObject({
        seed: z.int().min(0).max(4294967295).optional().describe('Seed of the world, default 0.'),
        save: SAVE.optional().describe('Resume this world, its seed included: the output of save_world, or a save of the client. bad_save when it is of another world version.'),
      }),
    },
    (input) => toolResult(world.newWorld(input)),
  );

  server.registerTool(
    'world_state',
    {
      description:
        'The Open world state: seed, hero, troop, obstacles broken, enemies beaten (ejected), the enemies in the window as the pushes ' +
        'left them, every boss lair with its distance from the hero and whether it is beaten, ending (the end line) once every lair is ' +
        'beaten, and a short window of cells round the hero (never the whole map). There is no loss state: the hero cannot lose, as in ' +
        `the client. ${WINDOW}`,
      inputSchema: z.strictObject({ radius: z.int().min(1).max(8).optional().describe('Cells of the window out from the hero, default 3.') }),
    },
    (input) => toolResult(world.state(input)),
  );

  server.registerTool(
    'save_world',
    {
      description:
        "The Open world in the client's save format (hero, troop, fight, broken, lairs beaten): give it to new_world as save to " +
        'resume the world later.',
    },
    () => toolResult(world.save()),
  );

  server.registerTool(
    'world_step',
    {
      description:
        'Roll the hero one cell, then the troop pushes on its own: push is its direction and the enemy ejected, null when no push ' +
        'was legal (the push can move the hero). Refused (blocked) by water, a peak, a wall, an enemy or an unbreakable tree, and ' +
        'nothing changes. Onto a lair the hero stays, moved is false and lair names the boss and the call that starts its fight ' +
        '(new_game with that boss).',
      inputSchema: z.strictObject({ direction: z.enum(['E', 'W', 'NE', 'SW', 'NW', 'SE']).describe('Direction of the step.') }),
    },
    (input) => toolResult(world.step(input)),
  );

  server.registerTool(
    'world_walk',
    {
      description:
        'Walk the hero to a cell, round the obstacles and the enemies, by the shortest path of the engine, up to 40 cells away, ' +
        'one step at a time as world_step: pushes lists the pushes of the troop on the way, and a step a push made impossible ends ' +
        'the walk there (compare the hero with the cell). no_path when there is no path (the hero cell, a lair, an enemy, off the ' +
        'world, too far, walled in).',
      inputSchema: z.strictObject({ q: z.int().describe('Column of the cell.'), r: z.int().describe('Row of the cell.') }),
    },
    (input) => toolResult(world.walk(input)),
  );

  server.registerTool(
    'join_world_room',
    {
      description:
        'Join the public Open world as a hero other players see: the world of seed 1305, room ow:1305:0, the hero on the spawn (0,0). ' +
        'Browsers show you as a named hero. This connects you to other players (their browsers see your IP address and your moves) and ' +
        'drops the world in progress: only call it when your user asked you to be in the public world. Then call world_heroes.',
      inputSchema: z.strictObject({ name: z.string().optional().describe('Your public name, up to 16 characters, default Claude.') }),
    },
    (input) => toolResult(worldRoom.join(input)),
  );

  server.registerTool(
    'world_heroes',
    {
      description:
        'The heroes in the public world room with a known place, the nearest to you first: id, name, cell (q,r) and distance in cells. ' +
        'A hero silent for 10 s is gone. problem says when the connection has an error. Empty when nobody else is here.',
    },
    () => toolResult(worldRoom.heroes()),
  );

  server.registerTool(
    'world_visit',
    {
      description:
        'Walk to a hero (its id from world_heroes) and stop next to it, following it if it moves, or walk to a cell (q and r). One cell every ' +
        '250 ms, the pace of a browser, at most 40 steps a call: arrived is false when that was not enough, call again. The room sees each step.',
      inputSchema: z.strictObject({
        hero: z.string().optional().describe('The id of the hero to walk to.'),
        q: z.int().optional().describe('Column of the cell, with r, when no hero.'),
        r: z.int().optional().describe('Row of the cell.'),
      }),
    },
    async (input) => toolResult(await worldRoom.visit(input)),
  );

  server.registerTool(
    'leave_world_room',
    { description: 'Leave the public world room: the players stop seeing you after about 10 s. Do it when you are done.' },
    () => toolResult(worldRoom.leave()),
  );

  return server;
}

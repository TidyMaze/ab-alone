// The tools of a local game against the bot or a boss (docs/specs/mcp.md sections 4 to 6): `new_game`, `get_state`,
// `legal_moves`, `play_move`, `resign`. One game at a time. The engine is the only judge: this holds no rule, it asks
// the engine and turns its codes into words. Resign is the one thing the engine does not model (rules.md OPEN-12).
import { randomUUID } from 'node:crypto';
import { ascii, boardText } from './board';
import { bossState, type BossLike, type BossState } from './boss';
import { formatMove, fromRecord, fromRecords, parseMove, toRecord } from './notation';

/** What the session uses of both `Engine` and `Encounter` in abalone-wasm. */
interface Playable {
  to_move(): number;
  legal_moves(): Int32Array;
  /** Throws the engine's reason when the move is illegal, the game is then unchanged. */
  play(mv: Int32Array): void;
  ejected(side: number): number;
  win_ejections(side: number): number;
  board(): Uint8Array;
  status(): number;
  draw_reason(): number;
  free(): void;
}

/** What the session uses of `Engine`: a game against the bot. */
export interface EngineLike extends Playable {
  best_move(nodes: number): Int32Array;
}

/** What the session uses of `Encounter`: a fight against a boss. */
export interface EncounterLike extends Playable, BossLike {
  boss_move(): Int32Array;
  /** The reply the boss announces for a move, empty when it announces nothing. */
  tell_move(mv: Int32Array): Int32Array;
}

/** Search budget of the bot in positions per move, `BOT_NODES` of client/src/bot.ts. */
export const BOT_NODES = 20000;

const BLACK = 1;
const WHITE = 2;
const RUNNING = 0;

export type Side = 'black' | 'white';
export type Status = 'running' | 'black_won' | 'white_won' | 'draw';
export type DrawReason = null | 'repetition' | 'no_ejection_cap';

const STATUSES: Status[] = ['running', 'black_won', 'white_won', 'draw'];
const DRAW_REASONS: DrawReason[] = [null, 'repetition', 'no_ejection_cap'];

/** Side code of abalone-wasm: `1` Black, anything else White, as the engine reads it. */
export function sideName(code: number): Side {
  return code === BLACK ? 'black' : 'white';
}

export function statusName(code: number): Status {
  return STATUSES[code]!;
}

export function drawReasonName(code: number): DrawReason {
  return DRAW_REASONS[code] as DrawReason;
}

export type ErrorCode = 'no_game' | 'unknown_boss' | 'game_over' | 'bad_move' | 'illegal_move';

export interface ToolError {
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export interface State {
  game_id: string;
  mode: 'bot' | 'boss';
  you: Side;
  to_move: Side;
  status: Status;
  draw_reason: DrawReason;
  resigned: boolean;
  ejected: Record<Side, number>;
  win_ejections: Record<Side, number>;
  ascii: string;
  board: string;
  last_moves: string[];
  boss: BossState | null;
}

export interface LegalMoves {
  to_move: Side;
  moves: string[];
  /** The reply a boss announces per move, empty against the bot and the bosses that announce nothing. */
  announces: Record<string, string>;
  count: number;
}

export interface Played {
  played: string;
  /** The bot or boss reply, `null` when the game ended on the agent's move. */
  reply: string | null;
  state: State;
}

export interface NewGameInput {
  boss?: string;
  seed?: number;
  bot_nodes?: number;
}

export interface PlayMoveInput {
  move: string;
}

interface Game {
  id: string;
  engine: Playable;
  /** The bot or boss move for the current position. */
  reply: () => Int32Array;
  boss: { id: string; encounter: EncounterLike } | null;
  resigned: boolean;
  /** Every ply in notation, oldest first, bot moves included. */
  plies: string[];
}

/** Plies shown in `last_moves`. */
const LAST_MOVES = 6;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: ErrorCode, message: string): Result<never> => ({ ok: false, error: { code, message } });

/** The one local game of the server. */
export class Session {
  private game: Game | null = null;

  constructor(
    private readonly newEngine: () => EngineLike,
    private readonly newEncounter: (boss: string, seed: number) => EncounterLike,
  ) {}

  /**
   * Drops any game in progress and starts one against the bot, or against `boss` with `seed`. The agent is Black and
   * moves first. An unknown boss keeps the game in progress.
   */
  newGame({ boss, seed = 0, bot_nodes = BOT_NODES }: NewGameInput): Result<State> {
    const game = { id: randomUUID(), resigned: false, plies: [] };
    let next: Game;
    if (boss === undefined) {
      const engine = this.newEngine();
      next = { ...game, engine, reply: () => engine.best_move(bot_nodes), boss: null };
    } else {
      let encounter: EncounterLike;
      try {
        encounter = this.newEncounter(boss, seed);
      } catch (reason) {
        return fail('unknown_boss', String(reason));
      }
      next = { ...game, engine: encounter, reply: () => encounter.boss_move(), boss: { id: boss, encounter } };
    }
    this.game?.engine.free();
    this.game = next;
    return ok(state(next));
  }

  getState(): Result<State> {
    return this.withGame((game) => ok(state(game)));
  }

  legalMoves(): Result<LegalMoves> {
    return this.withGame((game) => {
      // The engine lists no move once the game is over. A resign is not in the engine, so it is checked here.
      const legal = game.resigned ? [] : fromRecords(game.engine.legal_moves());
      const announces: Record<string, string> = {};
      if (game.boss) {
        for (const move of legal) {
          const reply = game.boss.encounter.tell_move(toRecord(move));
          if (reply.length > 0) announces[formatMove(move)] = formatMove(fromRecord(reply));
        }
      }
      const moves = legal.map(formatMove);
      return ok({ to_move: sideName(game.engine.to_move()), moves, announces, count: moves.length });
    });
  }

  /** Plays the agent's move, then the bot's or boss's reply in the same call, so the agent is to move again. */
  playMove({ move }: PlayMoveInput): Result<Played> {
    return this.withGame((game) => {
      if (over(game)) return gameOver();
      const parsed = parseMove(move);
      if (!parsed.ok) return fail('bad_move', parsed.message);
      try {
        game.engine.play(toRecord(parsed.move));
      } catch (reason) {
        return fail('illegal_move', String(reason));
      }
      const played = formatMove(parsed.move);
      game.plies.push(played);
      let reply: string | null = null;
      if (!over(game)) {
        const record = game.reply();
        game.engine.play(record);
        reply = formatMove(fromRecord(record));
        game.plies.push(reply);
      }
      return ok({ played, reply, state: state(game) });
    });
  }

  /** The bot or boss wins. The engine is not asked, it has no resign. */
  resign(): Result<State> {
    return this.withGame((game) => {
      if (over(game)) return gameOver();
      game.resigned = true;
      return ok(state(game));
    });
  }

  private withGame<T>(run: (game: Game) => Result<T>): Result<T> {
    return this.game ? run(this.game) : fail('no_game', 'no game started: call new_game first');
  }
}

function over(game: Game): boolean {
  return game.resigned || game.engine.status() !== RUNNING;
}

function gameOver(): Result<never> {
  return fail('game_over', 'the game has ended: call new_game to play again');
}

function state(game: Game): State {
  const { engine } = game;
  const board = engine.board();
  const boss = game.boss && bossState(game.boss.id, game.boss.encounter);
  if (boss && game.resigned) boss.result = 'lost';
  return {
    game_id: game.id,
    mode: boss ? 'boss' : 'bot',
    you: 'black',
    to_move: sideName(engine.to_move()),
    // The agent is Black against the bot or a boss (section 4.1), so a resign is a White win.
    status: game.resigned ? 'white_won' : statusName(engine.status()),
    draw_reason: drawReasonName(engine.draw_reason()),
    resigned: game.resigned,
    ejected: { black: engine.ejected(BLACK), white: engine.ejected(WHITE) },
    win_ejections: { black: engine.win_ejections(BLACK), white: engine.win_ejections(WHITE) },
    ascii: ascii(board),
    board: boardText(board),
    last_moves: game.plies.slice(-LAST_MOVES),
    boss,
  };
}

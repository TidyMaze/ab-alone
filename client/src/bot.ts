// Message protocol between the page and the bot worker. The worker owns its own wasm Engine, so
// the page sends the move history and the worker replays it, then asks `best_move`, or `evaluate`
// for the evaluation bar (#191). The hint (#192) is a `best_move` request too.

export interface BotRequest {
  id: number;
  history: number[][];
  nodes: number;
  /** Set in encounter mode: the worker replays the history into this boss fight. */
  boss?: BossRef;
  /** Search budget scaling percentage for boss encounter (e.g. 50, 100, 200). */
  difficultyPercent?: number;
  /** With a boss: asks the move of the player's side instead of the boss's (auto-play, #792). */
  player?: boolean;
  /** Set to ask for the search score of the position instead of a move (never with a boss). */
  evaluate?: boolean;
  /** Set in a rogue-lite fight (#798): the worker replays the history on an engine of this army. */
  army?: number;
}

export interface BossRef {
  id: string;
  seed: number;
}

export interface MoveAnswer {
  id: number;
  move: number[];
}

/** Answer to an `evaluate` request: the search score for the side to move, see the bridge docs. */
export interface ScoreAnswer {
  id: number;
  score: number;
}

export type BotResponse = MoveAnswer | ScoreAnswer;

/** The worker could not answer request `id`: `error` says why (#736). */
export interface BotFailure {
  id: number;
  error: string;
}

export interface EngineLike {
  play(mv: Int32Array): void;
  best_move(nodes: number): Int32Array | number[];
  evaluate(nodes: number): number;
}

export interface EncounterLike {
  play(mv: Int32Array): void;
  boss_move(): Int32Array | number[];
  player_move(): Int32Array | number[];
  scale_node_budget?(percent: number): void;
}

export interface WorkerLike {
  onmessage: ((e: MessageEvent<BotResponse | BotFailure>) => void) | null;
  onerror?: ((e: ErrorEvent) => void) | null;
  postMessage(req: BotRequest): void;
}

/** Search budget in positions: fixed, so the bot plays the same on every machine. */
export const BOT_NODES = 20000;

/** Evaluation bar budget in positions: a quarter of the bot's, never a clock (#191). */
export const EVAL_NODES = 5000;

/** Test-only budget: `?nodes=<n>` on the page sets the bot's and the hint's search, but only under automation
 * (navigator.webdriver), so a player never gets a weaker bot. Anything else keeps BOT_NODES. */
export function botBudget(search: string, automated: boolean): number {
  const n = Number(new URLSearchParams(search).get('nodes'));
  return automated && Number.isInteger(n) && n > 0 ? n : BOT_NODES;
}

/** Worker side: replay the game, return the bot's move, or the score for an `evaluate` request. */
export function answer(
  req: BotRequest,
  makeEngine: (army?: number) => EngineLike,
  makeEncounter: (id: string, seed: number) => EncounterLike,
): BotResponse {
  if (req.boss) {
    const fight = makeEncounter(req.boss.id, req.boss.seed);
    if (req.difficultyPercent && fight.scale_node_budget) {
      fight.scale_node_budget(req.difficultyPercent);
    }
    for (const mv of req.history) fight.play(Int32Array.from(mv));
    return { id: req.id, move: Array.from(req.player ? fight.player_move() : fight.boss_move()) };
  }
  const engine = makeEngine(req.army);
  for (const mv of req.history) engine.play(Int32Array.from(mv));
  if (req.evaluate) return { id: req.id, score: engine.evaluate(req.nodes) };
  return { id: req.id, move: Array.from(engine.best_move(req.nodes)) };
}

let nextId = 0;
/** The replies each worker still owes, by request id: several requests can be in flight on one worker (the
 * evaluation bar and the hint share the analysis worker, #192). A reply with an unknown id is ignored. */
const owed = new WeakMap<WorkerLike, Map<number, Owed>>();

interface Owed {
  resolve: (reply: BotResponse) => void;
  reject: (reason: Error) => void;
}

/** Posts one request, resolves with the reply that has its id, rejects when the worker answers an error or fails (#736). */
function ask<T extends BotResponse>(worker: WorkerLike, req: Omit<BotRequest, 'id'>): Promise<T> {
  const id = nextId++;
  let replies = owed.get(worker);
  if (!replies) {
    const waiting = new Map<number, Owed>();
    worker.onmessage = ({ data }) => {
      const pending = waiting.get(data.id);
      waiting.delete(data.id);
      if (!pending) return;
      if ('error' in data) pending.reject(new Error(data.error));
      else pending.resolve(data);
    };
    worker.onerror = () => {
      for (const pending of waiting.values()) pending.reject(new Error('The bot worker failed'));
      waiting.clear();
    };
    owed.set(worker, (replies = waiting));
  }
  return new Promise((resolve, reject) => {
    replies.set(id, { resolve: resolve as (reply: BotResponse) => void, reject });
    worker.postMessage({ id, ...req });
  });
}

/** Page side: post the history, resolve with the move record of the reply with the same id. */
export async function askBot(
  worker: WorkerLike,
  history: number[][],
  nodes = BOT_NODES,
  boss?: BossRef,
  difficultyPercent?: number,
  player?: boolean,
  army?: number,
): Promise<number[]> {
  return (await ask<MoveAnswer>(worker, { history, nodes, boss, difficultyPercent, player, army })).move;
}

/** Page side: the search score of the position after `history`, for the side to move. */
export async function askEval(worker: WorkerLike, history: number[][], nodes = EVAL_NODES): Promise<number> {
  return (await ask<ScoreAnswer>(worker, { history, nodes, evaluate: true })).score;
}

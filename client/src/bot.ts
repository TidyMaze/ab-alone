// Message protocol between the page and the bot worker. The worker owns its own wasm Engine, so
// the page sends the move history and the worker replays it, then asks `best_move`.

export interface BotRequest {
  id: number;
  history: number[][];
  nodes: number;
}

export interface BotResponse {
  id: number;
  move: number[];
}

export interface EngineLike {
  play(mv: Int32Array): void;
  best_move(nodes: number): Int32Array | number[];
}

export interface WorkerLike {
  onmessage: ((e: MessageEvent<BotResponse>) => void) | null;
  postMessage(req: BotRequest): void;
}

/** Search budget in positions: fixed, so the bot plays the same on every machine. */
export const BOT_NODES = 20000;

/** Worker side: replay the game, return the bot's move. */
export function answer(req: BotRequest, makeEngine: () => EngineLike): BotResponse {
  const engine = makeEngine();
  for (const mv of req.history) engine.play(Int32Array.from(mv));
  return { id: req.id, move: Array.from(engine.best_move(req.nodes)) };
}

let nextId = 0;

/** Page side: post the history, resolve with the move record of the reply with the same id. */
export function askBot(worker: WorkerLike, history: number[][], nodes = BOT_NODES): Promise<number[]> {
  const id = nextId++;
  return new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.id === id) resolve(e.data.move);
    };
    worker.postMessage({ id, history, nodes });
  });
}

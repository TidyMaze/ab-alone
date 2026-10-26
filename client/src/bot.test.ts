import { describe, expect, it } from 'vitest';
import {
  answer,
  askBot,
  askEval,
  BOT_NODES,
  botBudget,
  EVAL_NODES,
  type BotRequest,
  type BotResponse,
  type EncounterLike,
  type EngineLike,
} from './bot';

class FakeEngine implements EngineLike {
  played: number[][] = [];
  play(mv: Int32Array): void {
    this.played.push(Array.from(mv));
  }
  best_move(nodes: number): Int32Array {
    return Int32Array.from([1, 0, nodes, 0, 0, 0, 0, 0]);
  }
  /** A score that shows both the budget and the replayed history. */
  evaluate(nodes: number): number {
    return 2 * nodes + this.played.length;
  }
}

const noEncounter = (): never => {
  throw new Error('no boss');
};

class FakeEncounter implements EncounterLike {
  played: number[][] = [];
  scaledPercent: number | null = null;
  constructor(
    readonly boss: string,
    readonly seed: number,
  ) {}
  play(mv: Int32Array): void {
    this.played.push(Array.from(mv));
  }
  boss_move(): Int32Array {
    return Int32Array.from([1, this.seed, 0, 0, 0, 0, 0, 0]);
  }
  scale_node_budget(percent: number): void {
    this.scaledPercent = percent;
  }
}

describe('answer', () => {
  it('asks a boss encounter for its move when the request names a boss', () => {
    let made: FakeEncounter | null = null;
    const req = { id: 3, history: [[1, 0, 0, 2, 0, 0, 0, 0]], nodes: 5, boss: { id: 'echo', seed: 9 } };
    const reply = answer(req, () => new FakeEngine(), (id, seed) => (made = new FakeEncounter(id, seed)));
    expect(made!.boss).toBe('echo');
    expect(made!.played).toEqual([[1, 0, 0, 2, 0, 0, 0, 0]]);
    expect(made!.scaledPercent).toBeNull();
    expect(reply).toEqual({ id: 3, move: [1, 9, 0, 0, 0, 0, 0, 0] });
  });

  it('scales the boss encounter node budget when difficultyPercent is set', () => {
    let made: FakeEncounter | null = null;
    const req = {
      id: 4,
      history: [],
      nodes: 5,
      boss: { id: 'echo', seed: 9 },
      difficultyPercent: 200,
    };
    answer(req, () => new FakeEngine(), (id, seed) => (made = new FakeEncounter(id, seed)));
    expect(made!.scaledPercent).toBe(200);
  });

  it('replays the history into a fresh engine, then returns its best move', () => {
    const engine = new FakeEngine();
    const reply = answer({ id: 7, history: [[1, 0, 0, 2, 0, 0, 0, 0]], nodes: 123 }, () => engine, noEncounter);
    expect(engine.played).toEqual([[1, 0, 0, 2, 0, 0, 0, 0]]);
    expect(reply).toEqual({ id: 7, move: [1, 0, 123, 0, 0, 0, 0, 0] });
  });

  it('answers an evaluate request with the score of the replayed position, #191', () => {
    const engine = new FakeEngine();
    const req = { id: 8, history: [[1, 0, 0, 2, 0, 0, 0, 0]], nodes: 10, evaluate: true };
    const reply = answer(req, () => engine, noEncounter);
    expect(engine.played).toEqual([[1, 0, 0, 2, 0, 0, 0, 0]]);
    expect(reply).toEqual({ id: 8, score: 21 });
  });
});

describe('askBot', () => {
  /** A worker that answers every request with `answer`, asynchronously, like a real one. */
  function fakeWorker() {
    const worker = {
      onmessage: null as ((e: MessageEvent<BotResponse>) => void) | null,
      postMessage(req: BotRequest) {
        const reply = answer(req, () => new FakeEngine(), noEncounter);
        // A reply for another request must be ignored.
        queueMicrotask(() => worker.onmessage?.({ data: { id: req.id + 1000, move: [] } } as unknown as MessageEvent<BotResponse>));
        queueMicrotask(() => worker.onmessage?.({ data: reply } as unknown as MessageEvent<BotResponse>));
      },
    };
    return worker;
  }

  it('round-trips a request and resolves with the move of the matching reply', async () => {
    const worker = fakeWorker();
    await expect(askBot(worker, [[1, 0, 0, 2, 0, 0, 0, 0]], 50)).resolves.toEqual([
      1, 0, 50, 0, 0, 0, 0, 0,
    ]);
    // Ids are fresh per request: a second round trip works the same.
    await expect(askBot(worker, [], 60)).resolves.toEqual([1, 0, 60, 0, 0, 0, 0, 0]);
  });

  it('round-trips an evaluate request and resolves with the score of the matching reply, #191', async () => {
    const worker = fakeWorker();
    await expect(askEval(worker, [[1, 0, 0, 2, 0, 0, 0, 0]], 50)).resolves.toBe(101);
    await expect(askEval(worker, [])).resolves.toBe(2 * EVAL_NODES);
  });

  it('asks the evaluation with a node budget well below the bot one, so the bar never holds the game', () => {
    const sent: BotRequest[] = [];
    const worker = { onmessage: null, postMessage: (r: BotRequest) => void sent.push(r) };
    void askEval(worker, []);
    expect(sent[0]).toMatchObject({ history: [], nodes: EVAL_NODES, evaluate: true });
    expect(EVAL_NODES * 4).toBeLessThanOrEqual(BOT_NODES);
  });

  it('keeps several requests in flight on one worker, each resolved by its own reply, #192', async () => {
    // The evaluation bar and the hint share the analysis worker: a hint asked while an evaluation runs must not
    // leave the evaluation waiting forever, nor the other way round.
    const worker = fakeWorker();
    const got: unknown[] = [];
    void askEval(worker, [], 10).then((score) => got.push(score));
    void askBot(worker, [[1, 0, 0, 2, 0, 0, 0, 0]], 30).then((move) => got.push(move));
    await new Promise((done) => setTimeout(done, 0));
    expect(got).toEqual([20, [1, 0, 30, 0, 0, 0, 0, 0]]);
  });

  it('carries the boss and difficultyPercent in the request', () => {
    const sent: BotRequest[] = [];
    const worker = { onmessage: null, postMessage: (r: BotRequest) => void sent.push(r) };
    void askBot(worker, [], 10, { id: 'echo', seed: 4 }, 50);
    expect(sent[0]!.boss).toEqual({ id: 'echo', seed: 4 });
    expect(sent[0]!.difficultyPercent).toBe(50);
  });
});

describe('askBot failures, #736', () => {
  const never = () => {
    const worker = {
      onmessage: null as ((e: MessageEvent<BotResponse | { id: number; error: string }>) => void) | null,
      onerror: null as ((e: unknown) => void) | null,
      sent: [] as BotRequest[],
      postMessage(req: BotRequest) {
        worker.sent.push(req);
      },
    };
    return worker;
  };

  it('rejects the request that gets an error reply, and only that one', async () => {
    const worker = never();
    const failed = askBot(worker, [], 10);
    const fine = askEval(worker, [], 10);
    worker.onmessage!({ data: { id: worker.sent[0]!.id, error: 'Error: boom' } } as MessageEvent);
    worker.onmessage!({ data: { id: worker.sent[1]!.id, score: 7 } } as MessageEvent);
    await expect(failed).rejects.toThrow('Error: boom');
    await expect(fine).resolves.toBe(7);
  });

  it('rejects every request in flight when the worker itself fails, and later ones too', async () => {
    const worker = never();
    const first = askBot(worker, [], 10);
    const second = askEval(worker, [], 10);
    worker.onerror!({ message: 'no wasm' });
    await expect(first).rejects.toThrow('The bot worker failed');
    await expect(second).rejects.toThrow('The bot worker failed');
    // A reply that comes after is ignored, and a fresh request is asked again.
    worker.onmessage!({ data: { id: worker.sent[0]!.id, move: [] } } as MessageEvent);
    const third = askEval(worker, [], 10);
    worker.onmessage!({ data: { id: worker.sent[2]!.id, score: 3 } } as MessageEvent);
    await expect(third).resolves.toBe(3);
  });
});

describe('botBudget', () => {
  it('uses the test budget of ?nodes under automation, the bot budget otherwise', () => {
    expect(botBudget('?nodes=200', true)).toBe(200);
    expect(botBudget('?bot=off&nodes=200', true)).toBe(200);
    expect(botBudget('?nodes=200', false)).toBe(BOT_NODES);
  });

  it('keeps the bot budget when ?nodes is missing or is not a positive whole number', () => {
    expect(botBudget('', true)).toBe(BOT_NODES);
    expect(botBudget('?nodes=', true)).toBe(BOT_NODES);
    expect(botBudget('?nodes=0', true)).toBe(BOT_NODES);
    expect(botBudget('?nodes=-5', true)).toBe(BOT_NODES);
    expect(botBudget('?nodes=2.5', true)).toBe(BOT_NODES);
    expect(botBudget('?nodes=many', true)).toBe(BOT_NODES);
  });
});

import { describe, expect, it } from 'vitest';
import { answer, askBot, type BotRequest, type BotResponse, type EngineLike } from './bot';

class FakeEngine implements EngineLike {
  played: number[][] = [];
  play(mv: Int32Array): void {
    this.played.push(Array.from(mv));
  }
  best_move(nodes: number): Int32Array {
    return Int32Array.from([1, 0, nodes, 0, 0, 0, 0, 0]);
  }
}

describe('answer', () => {
  it('replays the history into a fresh engine, then returns its best move', () => {
    const engine = new FakeEngine();
    const reply = answer({ id: 7, history: [[1, 0, 0, 2, 0, 0, 0, 0]], nodes: 123 }, () => engine);
    expect(engine.played).toEqual([[1, 0, 0, 2, 0, 0, 0, 0]]);
    expect(reply).toEqual({ id: 7, move: [1, 0, 123, 0, 0, 0, 0, 0] });
  });
});

describe('askBot', () => {
  /** A worker that answers every request with `answer`, asynchronously, like a real one. */
  function fakeWorker() {
    const worker = {
      onmessage: null as ((e: MessageEvent<BotResponse>) => void) | null,
      postMessage(req: BotRequest) {
        const reply = answer(req, () => new FakeEngine());
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
});

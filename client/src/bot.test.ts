import { describe, expect, it, vi } from 'vitest';
import {
  answer,
  askBot,
  askEval,
  BOT_NODES,
  encounterFor,
  engineFor,
  botBudget,
  EVAL_NODES,
  type BotFailure,
  type BotRequest,
  type BotResponse,
  type TrainerRef,
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
  /** The auto-played side's move (#1500): its first value tells it from `best_move`. */
  auto_move(nodes: number): Int32Array {
    return Int32Array.from([3, 0, nodes, 0, 0, 0, 0, 0]);
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
  player_move(): Int32Array {
    return Int32Array.from([2, this.seed, 0, 0, 0, 0, 0, 0]);
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

  it('asks a boss encounter for the player move when the request is for the player, #792', () => {
    let made: FakeEncounter | null = null;
    const req = { id: 5, history: [], nodes: 5, boss: { id: 'echo', seed: 9 }, player: true };
    const reply = answer(req, () => new FakeEngine(), (id, seed) => (made = new FakeEncounter(id, seed)));
    expect(made!.boss).toBe('echo');
    expect(reply).toEqual({ id: 5, move: [2, 9, 0, 0, 0, 0, 0, 0] });
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

  it("hands a boss fight the run's special marbles and relics to stand, #1494", () => {
    const made: unknown[][] = [];
    const make = (id: string, seed: number, placed?: number[][], relics?: number): FakeEncounter => (made.push([id, seed, placed, relics]), new FakeEncounter(id, seed));
    answer({ id: 4, history: [], nodes: 5, boss: { id: 'hull', seed: 9 }, placed: [[0, 4, 1]], relics: 0b11 }, () => new FakeEngine(), make);
    answer({ id: 5, history: [], nodes: 5, boss: { id: 'hull', seed: 9 } }, () => new FakeEngine(), make);
    expect(made).toEqual([['hull', 9, [[0, 4, 1]], 0b11], ['hull', 9, undefined, undefined]]);
  });

  it('builds the boss fight of a request: plain, or with the build of a run when the boss takes it, #1494', () => {
    const log: string[] = [];
    class Boss {
      constructor(
        readonly id: string,
        readonly seed: number,
      ) {}
      takes_build(): boolean {
        return this.id !== 'echo';
      }
      set_relics(mask: number): void {
        log.push(`${this.id} relics ${mask}`);
      }
      place_special(q: number, r: number, kind: number): void {
        log.push(`${this.id} ${q},${r},${kind}`);
      }
    }
    expect(encounterFor(Boss, 'hull', 3)).toMatchObject({ id: 'hull', seed: 3 });
    expect(encounterFor(Boss, 'hull', 3, [[0, 4, 1]])).toMatchObject({ id: 'hull' });
    expect(log).toEqual([]); // no relics given: not in a run
    encounterFor(Boss, 'hull', 3, [[0, 4, 1], [1, 3, 3]], 0);
    encounterFor(Boss, 'echo', 3, [[0, 4, 1]], 5);
    encounterFor(Boss, 'hull', 3, undefined, 5);
    expect(log).toEqual(['hull relics 0', 'hull 0,4,1', 'hull 1,3,3', 'hull relics 5']); // the flag first, none for the Echo
  });

  it('replays the history into a fresh engine, then returns its best move', () => {
    const engine = new FakeEngine();
    const reply = answer({ id: 7, history: [[1, 0, 0, 2, 0, 0, 0, 0]], nodes: 123 }, () => engine, noEncounter);
    expect(engine.played).toEqual([[1, 0, 0, 2, 0, 0, 0, 0]]);
    expect(reply).toEqual({ id: 7, move: [1, 0, 123, 0, 0, 0, 0, 0] });
  });

  it('asks a plain game for the auto-played move, which does not repeat into a draw, when the request is for the player, #1500', () => {
    const engine = new FakeEngine();
    const reply = answer({ id: 8, history: [], nodes: 77, player: true }, () => engine, noEncounter);
    expect(reply).toEqual({ id: 8, move: [3, 0, 77, 0, 0, 0, 0, 0] });
    expect(answer({ id: 9, history: [], nodes: 77 }, () => engine, noEncounter)).toEqual({ id: 9, move: [1, 0, 77, 0, 0, 0, 0, 0] }); // the bot's reply and the hint are unchanged
  });

  it('replays a rogue-lite fight on an engine of its army and its special marbles, #798 #961', () => {
    const made: unknown[][] = [];
    const make = (army?: number, placed?: number[][], foes?: number | number[], trainer?: TrainerRef, relics?: number) =>
      (made.push([army, placed, foes, trainer, relics]), new FakeEngine());
    answer({ id: 9, history: [], nodes: 5, army: 9, placed: [[0, 4, 1]], foes: 10, relics: 0b10001 }, make, noEncounter);
    answer({ id: 10, history: [], nodes: 5 }, make, noEncounter);
    answer({ id: 11, history: [], nodes: 5, trainer: { wave: 5, left: 4 } }, make, noEncounter);
    expect(made).toEqual([
      [9, [[0, 4, 1]], 10, undefined, 0b10001], // its relics too, #1457
      [undefined, undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, { wave: 5, left: 4 }, undefined],
    ]);
  });

  it('builds the engine of a request: a plain game, or an army with its special marbles placed, #961', () => {
    const placedOn: number[][] = [];
    class Board {
      army = 0;
      foes = 0;
      static with_army(army: number, foes: number): Board {
        return Object.assign(new Board(), { army, foes });
      }
      plan: number[] = [];
      static with_foes(army: number, plan: Int32Array): Board {
        return Object.assign(new Board(), { army, plan: Array.from(plan) });
      }
      static trainer(wave: number, left: number): Board {
        return Object.assign(new Board(), { army: 100 + wave, foes: left });
      }
      relics = 0;
      place_special(q: number, r: number, kind: number): void {
        placedOn.push([this.army, q, r, kind]);
      }
      set_relics(mask: number): void {
        this.relics = mask;
      }
    }
    expect(engineFor(Board).army).toBe(0);
    expect(engineFor(Board, 9).army).toBe(9);
    expect(engineFor(Board, 9).foes).toBe(14);
    expect(engineFor(Board, 9, [], 10).foes).toBe(10);
    expect(engineFor(Board, undefined, [], 14, { wave: 3, left: 5 })).toMatchObject({ army: 103, foes: 5 }); // a Trainer wave, #1159
    engineFor(Board, 9, [[0, 4, 1], [1, 3, 3]]);
    expect(placedOn).toEqual([[9, 0, 4, 1], [9, 1, 3, 3]]);
    expect(engineFor(Board, 9, [], 10, undefined, 0b10001).relics).toBe(0b10001); // the run's relics, #1457
    // The bot's army from a plan (#1462): its formation and special marbles stand, then the army's are placed.
    const formed = engineFor(Board, 9, [[0, 4, 1]], [10, 3, 4, -4, 2], undefined, 0b1);
    expect(formed).toMatchObject({ army: 9, foes: 0, plan: [10, 3, 4, -4, 2], relics: 1 });
    expect(placedOn.at(-1)).toEqual([9, 0, 4, 1]);
    expect(engineFor(Board, 9).relics).toBe(0);
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
      onmessage: null as ((e: MessageEvent<BotResponse | BotFailure>) => void) | null,
      postMessage(req: BotRequest) {
        const reply = answer(req, () => new FakeEngine(), noEncounter);
        // A reply for another request must be ignored.
        queueMicrotask(() => worker.onmessage?.({ data: { id: req.id + 1000, move: [] } } as unknown as MessageEvent<BotResponse>));
        queueMicrotask(() => worker.onmessage?.({ data: reply } as unknown as MessageEvent<BotResponse>));
      },
    };
    return worker;
  }

  it('posts the army of a rogue-lite fight, #798', async () => {
    const worker = fakeWorker();
    const posted = vi.spyOn(worker, 'postMessage');
    await askBot(worker, [], 50, undefined, undefined, undefined, 7, [[0, 4, 1]], 10, undefined, 0b1);
    expect(posted.mock.calls[0]![0]).toMatchObject({ army: 7, placed: [[0, 4, 1]], foes: 10, relics: 0b1 });
  });

  it('posts the wave of a Trainer game, #1159', async () => {
    const worker = fakeWorker();
    const posted = vi.spyOn(worker, 'postMessage');
    await askBot(worker, [], 50, undefined, undefined, undefined, undefined, undefined, undefined, { wave: 4, left: 6 });
    expect(posted.mock.calls[0]![0]).toMatchObject({ trainer: { wave: 4, left: 6 } });
  });

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
    expect(sent[0]!.player).toBeUndefined();
  });

  it('asks for the player move of a boss fight when told to, #792', () => {
    const sent: BotRequest[] = [];
    const worker = { onmessage: null, postMessage: (r: BotRequest) => void sent.push(r) };
    void askBot(worker, [], 10, { id: 'echo', seed: 4 }, 50, true);
    expect(sent[0]!.player).toBe(true);
  });
});

describe('askBot failures, #736', () => {
  const never = () => {
    const worker = {
      onmessage: null as ((e: MessageEvent<BotResponse | BotFailure>) => void) | null,
      onerror: null as ((e: ErrorEvent) => void) | null,
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
    worker.onerror!({ message: 'no wasm' } as ErrorEvent);
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

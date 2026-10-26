import { afterAll, describe, expect, it, vi } from 'vitest';
import type { BotRequest, BotResponse } from './bot';

// The worker's global scope, as the page's Worker sees it: the test posts by calling onmessage.
const scope = vi.hoisted(() => ({
  onmessage: null as ((e: { data: BotRequest }) => Promise<void>) | null,
  postMessage: vi.fn((_reply: BotResponse) => {}),
}));
vi.stubGlobal('self', scope);
afterAll(() => void vi.unstubAllGlobals());
vi.mock('abalone-wasm', async (importOriginal) => (await import('./test/wasm')).nodeWasm(importOriginal));
await import('./bot.worker');
const { Encounter, boss_ids } = await import('abalone-wasm');

const ask = async (req: BotRequest): Promise<BotResponse> => {
  scope.postMessage.mockClear();
  await scope.onmessage!({ data: req });
  expect(scope.postMessage).toHaveBeenCalledOnce();
  return scope.postMessage.mock.calls[0]![0];
};

describe('bot.worker', () => {
  it("answers a move request with the engine's move record, under the request's id", async () => {
    const reply = await ask({ id: 7, history: [], nodes: 50 });
    expect(reply).toMatchObject({ id: 7 });
    expect((reply as { move: number[] }).move).toHaveLength(8); // one move record, crates/abalone-wasm/src/lib.rs
  });

  it('answers an evaluate request with a score', async () => {
    expect(await ask({ id: 8, history: [], nodes: 50, evaluate: true })).toEqual({ id: 8, score: expect.any(Number) });
  });

  it('answers a request the engine cannot play with an error under its id instead of staying silent, #736', async () => {
    const reply = await ask({ id: 10, history: [], nodes: 50, boss: { id: 'no such boss', seed: 1 } });
    expect(reply).toEqual({ id: 10, error: expect.stringContaining('no such boss') });
  });

  it("answers in a boss fight with the boss's reply to the player's move", async () => {
    const boss = { id: boss_ids()[0]!, seed: 1 };
    const opening = Array.from(new Encounter(boss.id, boss.seed).legal_moves().slice(0, 8)); // the player moves first
    const reply = await ask({ id: 9, history: [opening], nodes: 50, boss });
    expect(reply).toMatchObject({ id: 9 });
    expect((reply as { move: number[] }).move.length).toBeGreaterThan(0);
  });
});

describe('bot.worker when the wasm fails to start, #736', () => {
  it('answers every request with the error of the start', async () => {
    vi.resetModules();
    vi.doMock('abalone-wasm', async (importOriginal) => ({
      ...(await importOriginal<typeof import('abalone-wasm')>()),
      default: () => Promise.reject(new Error('wasm fetch failed')),
    }));
    await import('./bot.worker');
    scope.postMessage.mockClear();
    await scope.onmessage!({ data: { id: 11, history: [], nodes: 50 } });
    expect(scope.postMessage).toHaveBeenCalledWith({ id: 11, error: 'Error: wasm fetch failed' });
    vi.doUnmock('abalone-wasm');
  });
});

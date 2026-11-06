import { describe, expect, it } from 'vitest';
import type { BotRequest, WorkerLike } from './bot';
import { lazyWorker } from './lazyworker';

const request = { id: 1 } as BotRequest;

function fake() {
  const real: WorkerLike & { posted: BotRequest[] } = {
    posted: [],
    onmessage: null,
    onerror: null,
    postMessage(req) {
      this.posted.push(req);
    },
  };
  return real;
}

describe('lazyWorker', () => {
  it('creates nothing until the first request, then posts it to the one real worker', () => {
    const real = fake();
    let created = 0;
    const lazy = lazyWorker(() => (created++, real));
    expect(created).toBe(0);
    lazy.postMessage(request);
    lazy.postMessage({ id: 2 } as BotRequest);
    expect(created).toBe(1);
    expect(real.posted.map((r) => r.id)).toEqual([1, 2]);
  });

  it('hands the replies and the failure to the handlers set on it, before or after the real worker exists', () => {
    const real = fake();
    const lazy = lazyWorker(() => real);
    const got: unknown[] = [];
    lazy.onmessage = (e) => void got.push(e.data);
    lazy.onerror = () => void got.push('failed');
    lazy.postMessage(request);
    real.onmessage!({ data: { id: 1 } } as never);
    real.onerror!({} as never);
    lazy.onmessage = (e) => void got.push(['late', e.data]);
    real.onmessage!({ data: { id: 2 } } as never);
    expect(got).toEqual([{ id: 1 }, 'failed', ['late', { id: 2 }]]);
  });

  it('ignores a reply or a failure when no handler is set', () => {
    const real = fake();
    const lazy = lazyWorker(() => real);
    lazy.postMessage(request);
    expect(() => {
      real.onmessage!({ data: { id: 1 } } as never);
      real.onerror!({} as never);
    }).not.toThrow();
  });
});

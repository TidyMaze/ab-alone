import type { WorkerLike } from './bot';

/** A bot worker that is created when the first request is posted to it (#1579): each one loads its own copy of the engine, so a page
 * that never asks it (the Hub, a game with no bar or no bot) never pays for it. The handlers set on it are the real worker's. */
export function lazyWorker(create: () => WorkerLike): WorkerLike {
  let real: WorkerLike | null = null;
  const lazy: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(req) {
      if (!real) {
        real = create();
        real.onmessage = (e) => lazy.onmessage?.(e);
        real.onerror = (e) => lazy.onerror?.(e);
      }
      real.postMessage(req);
    },
  };
  return lazy;
}

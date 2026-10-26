import init, { Encounter, Engine } from 'abalone-wasm';
import { answer, type BotRequest } from './bot';

// Thin glue (bot.worker.test.ts): loads wasm once, answers each request. A failure, of the start or of the search,
// is answered as `{ id, error }` so the page never waits for a reply that will not come (#736).
const ready = init().then(() => '', String);
self.onmessage = async (e: MessageEvent<BotRequest>) => {
  const { id } = e.data;
  try {
    const failure = await ready;
    self.postMessage(failure ? { id, error: failure } : answer(e.data, () => new Engine(), (boss, seed) => new Encounter(boss, seed)));
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

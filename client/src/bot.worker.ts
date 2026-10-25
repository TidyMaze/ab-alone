import init, { Encounter, Engine } from 'abalone-wasm';
import { answer, type BotRequest } from './bot';

// Thin glue (bot.worker.test.ts): loads wasm once, answers each request.
const ready = init();
self.onmessage = async (e: MessageEvent<BotRequest>) => {
  await ready;
  self.postMessage(answer(e.data, () => new Engine(), (id, seed) => new Encounter(id, seed)));
};

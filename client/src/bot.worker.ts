import init, { Engine } from 'abalone-wasm';
import { answer, type BotRequest } from './bot';

// Thin glue, covered by the Playwright bot test: loads wasm once, answers each request.
const ready = init();
self.onmessage = async (e: MessageEvent<BotRequest>) => {
  await ready;
  self.postMessage(answer(e.data, () => new Engine()));
};

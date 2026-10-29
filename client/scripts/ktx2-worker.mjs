// One thread of the KTX2 encode (ktx2-textures.mjs `inWorkers`): Basis Universal is single-threaded WebAssembly, so the
// textures encode side by side, one per thread. Its encode is unit tested in the main thread (ktx2-encode.mjs).
/* v8 ignore start */
import { parentPort } from 'node:worker_threads';
import { encodeBytes } from './ktx2-encode.mjs';

parentPort.on('message', async ({ bytes, file, options }) => parentPort.postMessage(await encodeBytes(bytes, file, options)));
/* v8 ignore stop */

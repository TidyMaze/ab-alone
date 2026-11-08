// The wasm engine in Node, for the tests that run code which calls the engine's init with no argument (bot.worker.ts,
// main.ts): Node's fetch cannot read a file:// URL, so the bytes are read from crates/edgefall-wasm/pkg and handed to
// init. node:fs is imported untyped, as in antistalling.test.ts: the client has no Node types.
type Wasm = typeof import('edgefall-wasm');

const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: string): Promise<Uint8Array> };
// A path, not a URL: under jsdom, URL is jsdom's own, which node:fs does not take. `here` keeps vite from turning the
// URL into a /@fs/ asset URL, as it does for `new URL('...', import.meta.url)` under jsdom.
const here = import.meta.url;
const path = decodeURIComponent(new URL('../../../crates/edgefall-wasm/pkg/edgefall_wasm_bg.wasm', here).pathname);
const bytes = await readFile(path);

/** The edgefall-wasm module with an init that loads the bytes above, for `vi.mock('edgefall-wasm', nodeWasm)`. */
export async function nodeWasm(importOriginal: () => Promise<Wasm>): Promise<Wasm> {
  const wasm = await importOriginal();
  return { ...wasm, default: () => wasm.default({ module_or_path: bytes }) };
}

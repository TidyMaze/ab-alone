// Test setup: starts the WASM package for the tests that step the hero (`heroStep` calls the bridge's `world_step`). Import it for its
// effect, before the code under test runs.
import init from 'abalone-wasm';

const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: string): Promise<Uint8Array> };
// A path, not a URL, as in ./wasm.ts: under jsdom, URL is jsdom's own, which node:fs does not take.
const here = import.meta.url;
await init({ module_or_path: await readFile(decodeURIComponent(new URL('../../../crates/abalone-wasm/pkg/abalone_wasm_bg.wasm', here).pathname)) });

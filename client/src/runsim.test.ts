import { describe, expect, it } from 'vitest';
import { ACT_PERCENT } from './roguelite';

// #1537: the run simulator (crates/abalone-core/examples/run_sim.rs) plays the act bosses at the page's strengths, and
// keeps its own copy of them, as the engine has none. The test reads the example's source with node:fs, imported untyped:
// the client has no Node types (readme.test.ts).
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
const source = new TextDecoder().decode(await readFile(new URL('../../crates/abalone-core/examples/run_sim.rs', import.meta.url)));

describe('the run simulator', () => {
  it('plays the act bosses at the strengths of ACT_PERCENT (#1537)', () => {
    const copy = /^const ACT_PERCENT: \[u32; 3\] = \[([\d, ]+)\];$/m.exec(source)!;
    expect(copy[1]!.split(',').map(Number)).toEqual(ACT_PERCENT.slice(0, 3));
  });
});

import { describe, expect, it } from 'vitest';
import { ACT_ONE_LEAVES, ACT_PERCENT, ACT_TWO_GUEST_ODDS, COMMANDERS, Relic, SPECIAL_LOOKS } from './roguelite';

// #1537: the run simulator (crates/abalone-core/examples/run_sim.rs) plays the act bosses at the page's strengths, and
// keeps its own copy of them, as the engine has none. The test reads the example's source with node:fs, imported untyped:
// the client has no Node types (readme.test.ts).
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
const source = new TextDecoder().decode(await readFile(new URL('../../crates/abalone-core/examples/run_sim.rs', import.meta.url)));

const ladder = new TextDecoder().decode(await readFile(new URL('../../crates/abalone-core/src/encounter/ladder.rs', import.meta.url)));

describe('the run simulator', () => {
  it('leaves act 1 the same bosses as the page (#1599, ACT_ONE_LEAVES of ladder.rs)', () => {
    const copy = /^pub const ACT_ONE_LEAVES: \[&str; 4\] = \[([^\]]+)\];$/m.exec(ladder)!;
    expect(copy[1]!.split(',').map((id) => id.trim().replace(/"/g, ''))).toEqual(ACT_ONE_LEAVES);
  });

  it('deals act 2 one of those four at the odds of the page (#1635, ACT_TWO_GUEST_ODDS of ladder.rs)', () => {
    expect(Number(/^pub const ACT_TWO_GUEST_ODDS: u64 = (\d+);$/m.exec(ladder)![1])).toBe(ACT_TWO_GUEST_ODDS);
  });

  it('plays the act bosses at the strengths of ACT_PERCENT (#1537)', () => {
    const copy = /^const ACT_PERCENT: \[u32; 3\] = \[([\d, ]+)\];$/m.exec(source)!;
    expect(copy[1]!.split(',').map(Number)).toEqual(ACT_PERCENT.slice(0, 3));
  });

  // #1632: the simulator's copy of the four commanders (name, relic, special marbles) is the page's.
  it('starts the commanders as the page does (#1632)', () => {
    const rows = [...source.matchAll(/^ {4}\("([^"]+)", Relic::(\w+), (?:None|Some\(\(Special::(\w+), (\d+)\)\))\),$/gm)];
    const relics = new Map(Object.entries(Relic));
    const copy = rows.map((r) => ({
      name: r[1]!,
      relic: relics.get(r[2]!),
      specials: SPECIAL_LOOKS.map((l) => (l.name === r[3] ? Number(r[4]) : 0)),
    }));
    expect(copy).toEqual(COMMANDERS.map((c) => ({ name: c.name, relic: c.relic, specials: c.specials })));
  });
});

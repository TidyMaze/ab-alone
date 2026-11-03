// @vitest-environment jsdom
// Audit-net (CTF 2026-11-03): the Open world event set. Fails today.
import { describe, expect, it } from 'vitest';
import { generateKeys } from './moverecord';
import { BreakSet, signBeaten, signBreak, signLair } from './worldevents';
import { PUBLIC_SEED } from './worldpeers';

describe('audit-net: world events', () => {
  it('A-W1: a `beaten` event on a lair cell does not shut out the lair-won event of the same cell', async () => {
    const keys = await generateKeys();
    const set = new BreakSet(null);
    expect(set.add(await signBeaten(keys, PUBLIC_SEED, 5, -3))).toBe(true); // any peer may send it, canBeaten is a rules gate
    // today false: the set is keyed by cell, not by kind, so a peer that heard `beaten` first refuses the real `lair` event
    expect(set.add(await signLair(keys, PUBLIC_SEED, 5, -3))).toBe(true);
  });

  it('a lair event is kept once, and a break is not replaced by a lair event', async () => {
    const keys = await generateKeys();
    const set = new BreakSet(null);
    expect(set.add(await signLair(keys, PUBLIC_SEED, 1, 1))).toBe(true);
    expect(set.add(await signLair(keys, PUBLIC_SEED, 1, 1))).toBe(false);
    expect(set.add(await signBreak(keys, PUBLIC_SEED, 2, 2))).toBe(true);
    expect(set.add(await signLair(keys, PUBLIC_SEED, 2, 2))).toBe(false);
  });
});

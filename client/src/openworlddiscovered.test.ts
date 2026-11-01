import { describe, expect, it } from 'vitest';
import { CHUNK } from './openworld';
import { decodeDiscovered, Discovered, SIGHT } from './openworlddiscovered';

// The cells of the Open world the hero has discovered (#1411, docs/specs/openworld.md section 9): a bitset per chunk.

/** The hex distance between two cells. */
const distance = (q: number, r: number): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

describe('Discovered', () => {
  it('starts with nothing discovered', () => {
    const seen = new Discovered();
    expect(seen.has(0, 0)).toBe(false);
    expect(seen.count).toBe(0);
  });

  it('reveals the hex disc of SIGHT (10) cells round a cell, and nothing past it', () => {
    const seen = new Discovered();
    seen.reveal([0, 0]);
    expect(SIGHT).toBe(10);
    for (let q = -12; q <= 12; q++) for (let r = -12; r <= 12; r++) expect(seen.has(q, r), `${q},${r}`).toBe(distance(q, r) <= SIGHT);
    expect(seen.count).toBe(3 * SIGHT * (SIGHT + 1) + 1);
  });

  it('adds up as the hero walks: a cell revealed twice counts once, across chunk borders and below zero', () => {
    const seen = new Discovered();
    seen.reveal([-CHUNK, -CHUNK]);
    const once = seen.count;
    seen.reveal([-CHUNK, -CHUNK]);
    expect(seen.count).toBe(once);
    seen.reveal([-CHUNK + 1, -CHUNK]);
    expect(seen.count).toBe(once + 2 * SIGHT + 1);
    expect(seen.has(-CHUNK - SIGHT, -CHUNK)).toBe(true);
    expect(seen.has(-CHUNK + 1 + SIGHT, -CHUNK)).toBe(true);
  });

  it('saves as one entry a chunk, its bits in base64, and comes back the same', () => {
    const seen = new Discovered();
    seen.reveal([3, 3]);
    seen.reveal([40, -20]);
    const save = seen.toJSON();
    for (const [cx, cy, bits] of save) {
      expect(Number.isInteger(cx) && Number.isInteger(cy)).toBe(true);
      expect(bits).toHaveLength(44); // 32 bytes
    }
    const back = Discovered.from(decodeDiscovered(JSON.parse(JSON.stringify(save)))!);
    expect(back.count).toBe(seen.count);
    for (let q = -10; q <= 55; q++) for (let r = -35; r <= 15; r++) expect(back.has(q, r)).toBe(seen.has(q, r));
  });
});

describe('decodeDiscovered', () => {
  it('takes a list of chunks with whole coordinates and 32 bytes of bits', () => {
    expect(decodeDiscovered([])).toEqual([]);
    const save = new Discovered();
    save.reveal([0, 0]);
    expect(decodeDiscovered(save.toJSON())).toEqual(save.toJSON());
  });

  it('refuses anything else: no list, a wrong entry, coordinates that are not whole, bits that are not base64 or of another length', () => {
    const bits = btoa(String.fromCharCode(...new Uint8Array(32)));
    for (const bad of [undefined, 'x', {}, [1], [[0, 0]], [[0.5, 0, bits]], [[0, 'a', bits]], [[0, 0, 3]], [[0, 0, '!!']], [[0, 0, btoa('abc')]]]) {
      expect(decodeDiscovered(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { localPair } from './transport';
import { GENESIS, type MoveRecord } from './moverecord';

const rec = (seq: number): MoveRecord => ({
  game: 'g',
  seq,
  prev: GENESIS,
  move: [1, 0, 0, 2, 0, 0, 0, 0],
  pub: 'k',
  sig: 's',
});

describe('localPair', () => {
  it('delivers what one side sends to the other, in order', () => {
    const [a, b] = localPair();
    const got: number[] = [];
    b.onRecord((r) => got.push((r as MoveRecord).seq));
    a.send(rec(0));
    a.send(rec(1));
    a.send(rec(2));
    expect(got).toEqual([0, 1, 2]);
  });

  it('works both ways and never echoes to the sender', () => {
    const [a, b] = localPair();
    const atA: number[] = [];
    const atB: number[] = [];
    a.onRecord((r) => atA.push((r as MoveRecord).seq));
    b.onRecord((r) => atB.push((r as MoveRecord).seq));
    a.send(rec(0));
    b.send(rec(1));
    expect(atA).toEqual([1]);
    expect(atB).toEqual([0]);
  });

  it('starts open and tells listeners when it closes', () => {
    const [a, b] = localPair();
    expect(a.state).toBe('open');
    const seen: string[] = [];
    b.onState((s) => seen.push(s));
    a.close();
    expect(a.state).toBe('closed');
    expect(b.state).toBe('closed');
    expect(seen).toEqual(['closed']);
  });

  it('drops sends after close and stays closed on a second close', () => {
    const [a, b] = localPair();
    const got: number[] = [];
    const seen: string[] = [];
    b.onRecord((r) => got.push((r as MoveRecord).seq));
    b.onState((s) => seen.push(s));
    a.close();
    a.send(rec(0));
    b.close();
    expect(got).toEqual([]);
    expect(seen).toEqual(['closed']);
  });

  it('drops a record nobody listens to and closes without state listeners', () => {
    const [a, b] = localPair();
    a.send(rec(0));
    b.close();
    expect(a.state).toBe('closed');
  });
});

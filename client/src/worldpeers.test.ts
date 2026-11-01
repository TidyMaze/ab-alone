import { describe, expect, it } from 'vitest';
import { decode, encodeHello, encodePos, hexDistance, KEEPALIVE_MS, MAX_PEERS, MIN_GAP_MS, PEER_TTL_MS, Peers, PUBLIC_SEED, roomOf, SEND_MS, Sender } from './worldpeers';

describe('the wire format', () => {
  it('names one room for the public world', () => {
    expect(roomOf(PUBLIC_SEED)).toBe(`ow:${PUBLIC_SEED}:0`);
  });

  it('a Hello is 2 bytes and a position 7, versioned', () => {
    expect(encodeHello()).toEqual(Uint8Array.of(1, 1));
    expect(encodePos(3, -2, 9)).toEqual(Uint8Array.of(1, 2, 0, 3, 0xff, 0xfe, 9));
    expect(decode(encodeHello())).toEqual({ t: 'hello' });
    expect(decode(encodePos(3, -2, 9))).toEqual({ t: 'pos', q: 3, r: -2, seq: 9 });
    expect(decode(encodePos(-32768, 32767, 255))).toEqual({ t: 'pos', q: -32768, r: 32767, seq: 255 });
  });

  it('refuses what is not ours: wrong version, type, length, or not bytes', () => {
    expect(decode(Uint8Array.of(2, 1))).toBeNull(); // another version
    expect(decode(Uint8Array.of(1, 9))).toBeNull(); // unknown type
    expect(decode(Uint8Array.of(1, 1, 0))).toBeNull(); // Hello with a tail
    expect(decode(Uint8Array.of(1, 2, 0, 3))).toBeNull(); // short position
    expect(decode(Uint8Array.of(1))).toBeNull();
    expect(decode('hello')).toBeNull();
    expect(decode({ t: 'pos' })).toBeNull();
    expect(decode(null)).toBeNull();
  });

  it('a position outside the 16-bit range is clamped, never wrapped', () => {
    expect(decode(encodePos(40000, -40000, 300))).toEqual({ t: 'pos', q: 32767, r: -32768, seq: 44 });
  });
});

describe('hexDistance', () => {
  it('counts cells between two axial cells', () => {
    expect(hexDistance([0, 0], [0, 0])).toBe(0);
    expect(hexDistance([0, 0], [3, 0])).toBe(3);
    expect(hexDistance([0, 0], [2, -3])).toBe(3);
    expect(hexDistance([1, 1], [-2, 3])).toBe(3);
  });
});

describe('Sender: position on change, 4 Hz at most', () => {
  it('sends the first position, then only a change, no faster than every 250 ms', () => {
    const s = new Sender();
    expect(SEND_MS).toBe(250);
    s.set(0, 0);
    expect(s.due(0)).toEqual(encodePos(0, 0, 0));
    expect(s.due(10)).toBeNull(); // nothing changed
    s.set(1, 0);
    expect(s.due(100)).toBeNull(); // too soon
    expect(s.due(250)).toEqual(encodePos(1, 0, 1));
    s.set(2, 0);
    s.set(3, 0); // only the last place counts
    expect(s.due(500)).toEqual(encodePos(3, 0, 2));
  });

  it('repeats the position every 5 s while still, so peers keep it', () => {
    const s = new Sender();
    s.set(4, 4);
    s.due(0);
    expect(s.due(KEEPALIVE_MS - 1)).toBeNull();
    expect(s.due(KEEPALIVE_MS)).toEqual(encodePos(4, 4, 1));
  });

  it('sends nothing before a place is known; the seq wraps at 256', () => {
    const s = new Sender();
    expect(s.due(1e6)).toBeNull();
    let last: Uint8Array = new Uint8Array();
    for (let i = 0; i < 257; i++) {
      s.set(i, 0);
      last = s.due(i * SEND_MS)!;
    }
    expect(last[6]).toBe(0); // the 257th message
  });

  it('now(): the current place for a peer that just joined', () => {
    const s = new Sender();
    expect(s.now()).toBeNull();
    s.set(2, 1);
    expect(s.now()).toEqual(encodePos(2, 1, 255)); // the seq of the last send, so the next send is newer for the peer
    s.due(0);
    expect(s.now()).toEqual(encodePos(2, 1, 0));
    expect(s.now()).toEqual(encodePos(2, 1, 0)); // asking does not use a seq of its own
  });
});

describe('Peers', () => {
  const pos = (q: number, r: number, seq: number) => ({ t: 'pos' as const, q, r, seq });

  it('shows a peer only after its Hello', () => {
    const p = new Peers();
    expect(p.position('a', pos(1, 1, 0), 0)).toBe(false);
    expect(p.cells()).toEqual([]);
    p.hello('a', 0);
    expect(p.position('a', pos(1, 1, 0), 0)).toBe(true);
    expect(p.cells()).toEqual([{ peer: 'a', cell: [1, 1] }]);
  });

  it('lists no peer that said Hello but has sent no place yet', () => {
    const p = new Peers();
    p.hello('a', 0);
    expect(p.size).toBe(1);
    expect(p.cells([0, 0])).toEqual([]);
  });

  it('drops a peer that leaves, and one silent for 10 s', () => {
    const p = new Peers();
    p.hello('a', 0);
    p.hello('b', 0);
    p.position('a', pos(1, 0, 0), 0);
    p.position('b', pos(2, 0, 0), 0);
    p.leave('a');
    p.leave('nobody');
    expect(p.cells().map((c) => c.peer)).toEqual(['b']);
    p.expire(PEER_TTL_MS);
    expect(p.cells().map((c) => c.peer)).toEqual(['b']);
    p.expire(PEER_TTL_MS + 1);
    expect(p.cells()).toEqual([]);
  });

  it('refuses a flood: a message under MIN_GAP_MS after the last one is dropped', () => {
    const p = new Peers();
    p.hello('a', 0);
    expect(p.position('a', pos(1, 0, 0), 1000)).toBe(true);
    expect(p.position('a', pos(2, 0, 1), 1000 + MIN_GAP_MS - 1)).toBe(false);
    expect(p.position('a', pos(2, 0, 1), 1000 + MIN_GAP_MS)).toBe(true);
  });

  it('refuses an older seq (mod 256) but accepts the wrap', () => {
    const p = new Peers();
    p.hello('a', 0);
    p.position('a', pos(5, 0, 10), 0);
    expect(p.position('a', pos(1, 0, 9), 1000)).toBe(false);
    expect(p.position('a', pos(1, 0, 10), 1000)).toBe(false); // same seq twice
    expect(p.position('a', pos(6, 0, 11), 1000)).toBe(true);
    p.hello('b', 0);
    p.position('b', pos(0, 0, 250), 0);
    expect(p.position('b', pos(1, 0, 2), 1000)).toBe(true); // 250 -> 2 is forward across the wrap
  });

  it('a second Hello keeps the place and the peer stays one entry', () => {
    const p = new Peers();
    p.hello('a', 0);
    p.position('a', pos(1, 0, 0), 0);
    p.hello('a', 5);
    expect(p.cells()).toEqual([{ peer: 'a', cell: [1, 0] }]);
  });

  it('shows at most MAX_PEERS, the nearest to a cell first', () => {
    const p = new Peers();
    for (let i = 0; i < MAX_PEERS + 5; i++) {
      p.hello(`p${i}`, 0);
      p.position(`p${i}`, pos(100 - i, 0, 0), 0);
    }
    const shown = p.cells([0, 0]);
    expect(shown).toHaveLength(MAX_PEERS);
    expect(shown[0]!.peer).toBe(`p${MAX_PEERS + 4}`); // q = 100 - 24 = 76, the nearest
  });

  it('caps the table itself: a Hello past 4 x MAX_PEERS is ignored', () => {
    const p = new Peers();
    for (let i = 0; i < MAX_PEERS * 4 + 3; i++) p.hello(`p${i}`, 0);
    expect(p.size).toBe(MAX_PEERS * 4);
  });
});

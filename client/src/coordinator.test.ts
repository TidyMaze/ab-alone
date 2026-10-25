import { describe, expect, it } from 'vitest';
import { BEAT_MS, beatPeriod, chooseCoordinator, Coordination, MISSES } from './coordinator';

// Issue #359, docs/specs/tech.md section 6 (Host / coordinator migration). No test here waits for a time:
// `now` is a number the test moves.
const ORDER = ['a', 'b', 'c', 'd']; // join_seq 1 to 4, the coordinator `a` first

// A room as peer `self` sees it: everyone just said Hello at t = 0.
function room(self: string, order = ORDER): Coordination {
  const c = new Coordination(self);
  c.adopt(order);
  for (const k of order) if (k !== self) c.beat(k, 0);
  return c;
}

// Everyone but the keys in `silent` beats at `t`.
function beats(c: Coordination, t: number, silent: string[] = []): void {
  for (const k of ORDER) if (!silent.includes(k) && k !== c.self) c.beat(k, t);
}

describe('chooseCoordinator', () => {
  it('is the live key with the lowest join_seq', () => {
    expect(chooseCoordinator(ORDER, new Set(['b', 'c', 'd']))).toBe('b');
    expect(chooseCoordinator(ORDER, new Set(['c', 'd']))).toBe('c');
    expect(chooseCoordinator(ORDER, new Set(['d', 'b']))).toBe('b'); // the order of the set does not matter
  });

  it('puts a key the order does not list after the listed ones, then by key, the same on every peer', () => {
    expect(chooseCoordinator(ORDER, new Set(['z', 'd']))).toBe('d');
    expect(chooseCoordinator(ORDER, new Set(['z', 'y']))).toBe('y');
  });

  it('is empty when nobody is live', () => {
    expect(chooseCoordinator(ORDER, new Set())).toBe('');
  });
});

describe('Coordination', () => {
  it('has no coordinator before the order is known, then the first key of the order', () => {
    const c = new Coordination('b');
    expect(c.coordinator).toBe('');
    expect(c.seq).toBe(0);
    c.adopt(ORDER);
    expect(c.coordinator).toBe('a');
    expect(c.seq).toBe(1);
    expect(c.seqOf('d')).toBe(4);
    expect(c.seqOf('z')).toBe(0);
  });

  it('keeps its coordinator when a later order arrives', () => {
    const c = room('b');
    c.adopt([...ORDER, 'e']);
    expect(c.coordinator).toBe('a');
    expect(c.seqOf('e')).toBe(5);
  });

  it('keeps the coordinator while its heartbeat comes: two misses are not three', () => {
    const c = room('b');
    expect(c.tick(MISSES * BEAT_MS)).toBeNull(); // exactly three beats of silence is not over yet
    c.beat('a', 2 * BEAT_MS);
    beats(c, 2 * BEAT_MS);
    expect(c.tick(4 * BEAT_MS)).toBeNull();
    expect(c.coordinator).toBe('a');
  });

  it('marks the coordinator gone after three misses and picks the lowest join_seq among the live', () => {
    const c = room('c');
    beats(c, BEAT_MS, ['a']);
    beats(c, 2 * BEAT_MS, ['a']);
    beats(c, 3 * BEAT_MS, ['a']);
    expect(c.tick(MISSES * BEAT_MS + 1)).toBe('b');
    expect(c.coordinator).toBe('b');
    expect(c.seq).toBe(2);
  });

  it('every peer picks the same coordinator, with no message exchanged', () => {
    const picks = ['b', 'c', 'd'].map((self) => {
      const c = room(self);
      beats(c, BEAT_MS, ['a']);
      beats(c, 3 * BEAT_MS, ['a']);
      c.tick(MISSES * BEAT_MS + 1);
      return c.coordinator;
    });
    expect(picks).toEqual(['b', 'b', 'b']);
  });

  it('moves within 20 s of the last heartbeat of the coordinator, ticked every second', () => {
    const c = room('d');
    let at = -1;
    for (let t = 0; t <= 20_000 && at < 0; t += 1000) {
      if (t % BEAT_MS === 0) beats(c, t, ['a']);
      if (c.tick(t) !== null) at = t;
    }
    expect(at).toBeGreaterThan(MISSES * BEAT_MS);
    expect(at).toBeLessThanOrEqual(20_000);
  });

  it('moves at once when the channel of the coordinator drops', () => {
    const c = room('c');
    expect(c.leave('a')).toBe('b');
    expect(c.leave('a')).toBeNull(); // already gone
  });

  it('does not move when another peer leaves, nor in a room of two: 1v1 has no host', () => {
    const c = room('b');
    expect(c.leave('d')).toBeNull();
    expect(c.coordinator).toBe('a');
    const duel = room('b', ['a', 'b']);
    expect(duel.leave('a')).toBeNull();
    expect(duel.coordinator).toBe('a');
  });

  it('a lone survivor takes over, and stays put once it is the coordinator', () => {
    const c = room('d');
    c.leave('a');
    c.leave('b');
    expect(c.leave('c')).toBe('d');
    expect(c.waiting).toEqual([]);
    expect(c.done).toBe(true);
  });

  it('never elects a key that went silent', () => {
    const c = room('d');
    beats(c, 2 * BEAT_MS, ['a', 'b']); // b is silent too
    beats(c, 4 * BEAT_MS, ['a', 'b']);
    expect(c.tick(MISSES * BEAT_MS + 1)).toBe('c');
  });

  it('a key that beats again after it was marked gone is live again, and the coordinator stays', () => {
    const c = room('c');
    beats(c, BEAT_MS, ['a']);
    beats(c, 3 * BEAT_MS, ['a']);
    c.tick(MISSES * BEAT_MS + 1); // b is now the coordinator
    c.beat('a', 4 * BEAT_MS);
    expect(c.coordinator).toBe('b');
    expect(c.waiting).toContain('a');
  });
});

describe('hand-over', () => {
  // Peer `c` saw `a` go away: b is the coordinator, c, d and (in a bigger room) a rejoin are to acknowledge.
  const over = (): Coordination => {
    const c = room('c');
    c.leave('a');
    return c;
  };

  it('waits for every live peer but the coordinator, and is done when each acknowledged', () => {
    const c = over();
    expect(c.waiting.sort()).toEqual(['c', 'd']);
    expect(c.done).toBe(false);
    c.ack('c', 'b');
    c.ack('d', 'b');
    expect(c.done).toBe(true);
  });

  it('ignores an acknowledgement of another coordinator and counts one that came before the election', () => {
    const c = room('c');
    c.ack('d', 'b'); // d was quicker than we were
    c.ack('c', 'a'); // for the old coordinator: nothing to do with this hand-over
    c.leave('a');
    expect(c.waiting).toEqual(['c']);
  });

  it('a peer that drops during the hand-over is not waited for', () => {
    const c = over();
    c.ack('c', 'b');
    expect(c.leave('d')).toBeNull();
    expect(c.done).toBe(true);
  });

  it('the new coordinator dropping during the hand-over hands over again, to the next live join_seq', () => {
    const c = over();
    c.ack('c', 'b');
    expect(c.leave('b')).toBe('c'); // acknowledgements of b count for nothing now
    expect(c.coordinator).toBe('c');
    expect(c.waiting).toEqual(['d']);
    c.ack('d', 'c');
    expect(c.done).toBe(true);
  });

  it('accepts the announcement of the coordinator it has, and refuses a later key while a lower one is live', () => {
    const c = room('d');
    expect(c.announced('a', 0)).toBe(true);
    expect(c.announced('c', 0)).toBe(false); // b and a are alive in our view: we elect c ourselves if they time out
    expect(c.announced('z', 0)).toBe(false); // not in the order
    expect(c.coordinator).toBe('a');
  });

  it('follows the announcement of the lowest join_seq even when its own view was partial', () => {
    const c = new Coordination('d'); // joined last: only the creator said Hello to it
    c.adopt(ORDER);
    c.beat('a', 0);
    expect(c.leave('a')).toBe('d'); // alone in its view, it elects itself
    expect(c.announced('b', 1)).toBe(true); // b proves itself live and is lower
    expect(c.coordinator).toBe('b');
    expect(c.waiting).toEqual(['d']);
  });
});

describe('beatPeriod', () => {
  it('takes the beat parameter in ms only under navigator.webdriver, never below 50 ms', () => {
    expect(beatPeriod('?beat=200', true)).toBe(200);
    expect(beatPeriod('?beat=200', false)).toBe(BEAT_MS);
    expect(beatPeriod('?beat=10', true)).toBe(BEAT_MS);
    expect(beatPeriod('?beat=x', true)).toBe(BEAT_MS);
    expect(beatPeriod('', true)).toBe(BEAT_MS);
  });
});

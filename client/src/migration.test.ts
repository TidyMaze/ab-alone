import { describe, expect, it } from 'vitest';
import { OnlineSession, type Judge } from './session';
import { generateKeys, signCoordinator, type Wire } from './moverecord';
import type { ConnectionState, Transport } from './transport';

// Issue #359: a room of four (creator, one more player, two spectators) loses its coordinator. The clock is
// a number the test moves and the heartbeat timers are run by hand, so nothing here waits for real seconds.
const BEAT = 5000;

// A room's wire: a send reaches every other end still in the room, or the one named. Delivery is synchronous.
class Mesh {
  readonly ends = new Map<string, End>();
  end(name: string): End {
    const e = new End(name, this);
    this.ends.set(name, e);
    return e;
  }
  /** `name` dies without a word: nobody is told, it just stops sending and receiving. */
  vanish(name: string): void {
    this.ends.delete(name);
  }
  /** `name`'s channel drops and every other end hears the leave. */
  drop(name: string): void {
    this.ends.delete(name);
    for (const e of this.ends.values()) e.left(name);
  }
}

class End implements Transport {
  state: ConnectionState = 'open';
  sent: Wire[] = [];
  record: (m: Wire, peer: string) => void = () => {};
  left: (peer: string) => void = () => {};
  constructor(
    private readonly name: string,
    private readonly mesh: Mesh,
  ) {}
  send(m: Wire, to?: string): void {
    this.sent.push(m);
    for (const [n, e] of this.mesh.ends) if (n !== this.name && (!to || to === n)) e.record(m, this.name);
  }
  onRecord(cb: (m: Wire, peer: string) => void): void {
    this.record = cb;
  }
  onState(): void {}
  onLeave(cb: (peer: string) => void): void {
    this.left = cb;
  }
  close(): void {}
}

const judge: Judge = { to_move: () => 1, play: () => {}, status: () => 0, restart: () => {} };

const sessions: OnlineSession[] = [];
async function settle(): Promise<void> {
  for (;;) {
    const queues = sessions.map((s) => s.settled);
    await Promise.all(queues);
    if (sessions.every((s, i) => s.settled === queues[i])) return;
  }
}

// One peer: its timers are in `timers`, run by `Room.advance`.
async function peer(mesh: Mesh, name: string, side: number, clock: { t: number }, beat = true) {
  const timers: { fn: () => void; ms: number; next: number }[] = [];
  const end = mesh.end(name);
  const coordinators: number[] = [];
  const s = new OnlineSession({
    game: 'g',
    side,
    keys: await generateKeys(),
    transport: end,
    judge,
    onMove: () => {},
    onRefuse: () => {},
    onCoordinator: () => coordinators.push(s.coordinatorSeq),
    ...(beat ? { beat: { ms: BEAT, now: () => clock.t, every: (fn: () => void, ms: number) => void timers.push({ fn, ms, next: ms }) } } : {}),
  });
  sessions.push(s);
  return { name, s, end, timers, coordinators };
}
type Peer = Awaited<ReturnType<typeof peer>>;

// Creator a, player b, spectators c and d, in this join order.
async function room(beat = true) {
  const mesh = new Mesh();
  const clock = { t: 0 };
  const a = await peer(mesh, 'a', 1, clock, beat);
  const b = await peer(mesh, 'b', 2, clock, beat);
  const c = await peer(mesh, 'c', 2, clock, beat);
  const d = await peer(mesh, 'd', 2, clock, beat);
  await settle();
  const all = [a, b, c, d];
  // Moves the clock by `ms`, one second at a time: the timers of the peers still in the room run, then the work they queued.
  const advance = async (ms: number): Promise<void> => {
    for (let i = 0; i < ms / 1000; i++) {
      clock.t += 1000;
      for (const p of all) {
        if (!mesh.ends.has(p.name)) continue;
        for (const tm of p.timers) {
          while (tm.next <= clock.t) {
            tm.fn();
            tm.next += tm.ms;
          }
        }
      }
      await settle();
    }
  };
  return { mesh, clock, a, b, c, d, advance };
}

const kinds = (p: Peer): string[] => p.end.sent.map((m) => (m as { kind: string }).kind);
const seqs = (...ps: Peer[]): number[] => ps.map((p) => p.s.coordinatorSeq);

describe('coordinator migration in a room of four', () => {
  it('every peer knows the creator as coordinator, join_seq 1, and sends a heartbeat every 5 s', async () => {
    const { a, b, c, d, advance } = await room();
    expect(seqs(a, b, c, d)).toEqual([1, 1, 1, 1]);
    expect(a.s.isCoordinator).toBe(true);
    expect(b.s.isCoordinator).toBe(false);
    expect(a.s.handover).toBe('none');
    expect(kinds(b)).not.toContain('beat');
    await advance(BEAT);
    expect(kinds(b).filter((k) => k === 'beat')).toHaveLength(1);
    await advance(BEAT);
    expect(kinds(b).filter((k) => k === 'beat')).toHaveLength(2);
    expect(seqs(a, b, c, d)).toEqual([1, 1, 1, 1]); // everyone beats: nobody moves
  });

  it('the coordinator dies in silence: the live peer with the lowest join_seq takes over on every peer, within 20 s', async () => {
    const { mesh, clock, b, c, d, advance } = await room();
    await advance(2 * BEAT);
    mesh.vanish('a');
    const died = clock.t;
    let moved = 0;
    while (seqs(b, c, d).some((n) => n !== 2) && clock.t - died < 20_000) {
      await advance(1000);
      moved = clock.t - died;
    }
    expect(seqs(b, c, d)).toEqual([2, 2, 2]);
    expect(moved).toBeGreaterThan(3 * BEAT - BEAT); // not before the beats it missed
    expect(moved).toBeLessThanOrEqual(20_000);
    expect(b.s.isCoordinator).toBe(true);
    expect(c.s.isCoordinator).toBe(false);
    await advance(1000);
    // b announced, c and d acknowledged, and every peer saw it.
    for (const p of [b, c, d]) expect(p.s.handover).toBe('done');
    expect(kinds(b).filter((k) => k === 'coordinator')).toHaveLength(1); // b announced and nobody else did
    expect(kinds(c)).toContain('coordinator'); // c acknowledged
  });

  it('a dropped channel moves it at once, without waiting for the heartbeat', async () => {
    const { mesh, b, c, d } = await room();
    mesh.drop('a');
    await settle();
    expect(seqs(b, c, d)).toEqual([2, 2, 2]);
    expect(b.s.handover).toBe('done');
  });

  it('the first successor dying as well hands over again, to the next join_seq', async () => {
    const { mesh, c, d, advance } = await room();
    mesh.vanish('a');
    mesh.vanish('b');
    await advance(20_000);
    expect(seqs(c, d)).toEqual([3, 3]);
    expect(c.s.isCoordinator).toBe(true);
    expect(c.s.handover).toBe('done');
    expect(d.s.handover).toBe('done');
  });

  it('a spectator that drops during the hand-over is not waited for', async () => {
    const { mesh, b, c, advance } = await room();
    mesh.vanish('a');
    mesh.vanish('d'); // dies at the same time: its acknowledgement never comes
    await advance(20_000);
    expect(seqs(b, c)).toEqual([2, 2]);
    expect(b.s.handover).toBe('done');
    expect(c.s.handover).toBe('done');
  });

  it('a room of two has no host: the creator leaving moves nothing', async () => {
    const mesh = new Mesh();
    const clock = { t: 0 };
    const a = await peer(mesh, 'a', 1, clock);
    const b = await peer(mesh, 'b', 2, clock);
    await settle();
    mesh.drop('a');
    await settle();
    expect(b.s.coordinatorSeq).toBe(1);
    expect(a.s.isCoordinator).toBe(true);
  });

  it('ignores an announcement with a bad signature, for another game, or from a key outside the room', async () => {
    const { mesh, b, c, advance } = await room();
    const stranger = await generateKeys();
    const good = await signCoordinator(stranger, { game: 'g', coordinator: stranger.pub });
    const send = (m: Wire): void => mesh.ends.get('b')!.record(m, 'c');
    send({ ...good, sig: good.sig.slice(0, -2) + 'AA' });
    send({ ...good, game: 'other' });
    send(good); // signed and for this game, but its key is not in the join order
    send({ kind: 'coordinator', game: 'g' } as unknown as Wire); // malformed
    send({ kind: 'beat' }); // from a peer that never said Hello: no key to credit
    await advance(1000);
    expect(seqs(b, c)).toEqual([1, 1]);
  });

  it('a session without the beat option sends no heartbeat and ignores one', async () => {
    const { mesh, clock, a, b, advance } = await room(false);
    await advance(2 * BEAT);
    expect(kinds(a)).not.toContain('beat');
    mesh.ends.get('b')!.record({ kind: 'beat' }, 'a');
    mesh.ends.get('b')!.record(await signCoordinator(await generateKeys(), { game: 'g', coordinator: 'x' }), 'a');
    await settle();
    expect(b.s.coordinatorSeq).toBe(0);
    expect(clock.t).toBe(2 * BEAT);
  });
});

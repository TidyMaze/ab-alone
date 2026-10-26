import { describe, expect, it } from 'vitest';
import { generateKeys, type Keys } from './moverecord';
import { commitOrder, hashOrder, RoundBook, signReveal, verifyCommit, verifyReveal, type Commit, type Reveal } from './royale-round';

// Issue #500, docs/specs/tech.md section 6 (Battle royale): commit, then reveal, then the round's orders. No test here
// waits for a time: `now` is a number the test moves. Each message is passed with the seat it came from: its author
// unless the test says it was forwarded.
const A = [1, 0, 0, 2, 0, 0, 0, 0];
const B = [3, 1, 0, 4, 0, 0, 0, 0];
const HOLD: number[] = [];
const COMMIT_BY = 30_000; // the commit deadline
const REVEAL_BY = 40_000; // the reveal deadline

async function seats(n: number): Promise<Keys[]> {
  return Promise.all(Array.from({ length: n }, () => generateKeys()));
}

const book = (keys: Keys[], round = 1): RoundBook => new RoundBook('g', round, keys.map((k) => k.pub), COMMIT_BY, REVEAL_BY);

describe('commitOrder / verifyCommit / verifyReveal', () => {
  it('signs a commit of the hash of the order and its nonce, and the matching reveal', async () => {
    const [k] = await seats(1);
    const { commit, reveal } = await commitOrder(k!, { game: 'g', round: 1, order: A });
    expect(commit).toMatchObject({ kind: 'commit', game: 'g', round: 1, pub: k!.pub });
    expect(reveal).toMatchObject({ kind: 'reveal', game: 'g', round: 1, order: A, pub: k!.pub });
    expect(reveal.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(commit.hash).toBe(await hashOrder(A, reveal.nonce));
    expect(await verifyCommit(commit)).toBe(true);
    expect(await verifyReveal(reveal)).toBe(true);
  });

  it('draws a fresh nonce each time, so two equal orders do not give the same hash', async () => {
    const [k] = await seats(1);
    const one = await commitOrder(k!, { game: 'g', round: 1, order: A });
    const two = await commitOrder(k!, { game: 'g', round: 1, order: A });
    expect(one.commit.hash).not.toBe(two.commit.hash);
  });

  it('refuses a tampered commit or reveal', async () => {
    const [k] = await seats(1);
    const { commit, reveal } = await commitOrder(k!, { game: 'g', round: 1, order: A });
    expect(await verifyCommit({ ...commit, hash: 'ab'.repeat(32) })).toBe(false);
    expect(await verifyCommit({ ...commit, round: 2 })).toBe(false);
    expect(await verifyCommit({ ...commit, game: 'h' })).toBe(false);
    expect(await verifyReveal({ ...reveal, order: B })).toBe(false);
    expect(await verifyReveal({ ...reveal, nonce: 'ab'.repeat(32) })).toBe(false);
    expect(await verifyReveal({ ...reveal, round: 2 })).toBe(false);
  });

  it('never takes a commit for a move record or a reveal: each signs its own bytes', async () => {
    const [k] = await seats(1);
    const { commit, reveal } = await commitOrder(k!, { game: 'g', round: 1, order: A });
    // A reveal whose nonce is the commit's hash carries the commit's signature: still refused.
    expect(await verifyReveal({ ...reveal, order: [], nonce: commit.hash, sig: commit.sig })).toBe(false);
  });
});

describe('RoundBook commits', () => {
  it('takes one signed commit per live seat, for this game and this round', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const { commit } = await commitOrder(a!, { game: 'g', round: 1, order: A });
    expect(await r.commit(commit, 0, a!.pub)).toBe(true);
  });

  it('refuses a commit for the wrong round or game, a bad signature, a key without a seat, or the same one again', async () => {
    const [a, b, stranger] = await seats(3);
    const r = book([a!, b!]);
    const wrongRound = (await commitOrder(a!, { game: 'g', round: 2, order: A })).commit;
    const wrongGame = (await commitOrder(a!, { game: 'h', round: 1, order: A })).commit;
    const first = (await commitOrder(a!, { game: 'g', round: 1, order: A })).commit;
    const foreign = (await commitOrder(stranger!, { game: 'g', round: 1, order: A })).commit;
    const forged: Commit = { ...(await commitOrder(b!, { game: 'g', round: 1, order: A })).commit, hash: first.hash };
    expect(await r.commit(wrongRound, 0, a!.pub)).toBe(false);
    expect(await r.commit(wrongGame, 0, a!.pub)).toBe(false);
    expect(await r.commit(foreign, 0, stranger!.pub)).toBe(false);
    expect(await r.commit(forged, 0, b!.pub)).toBe(false);
    expect(await r.commit(first, 0, a!.pub)).toBe(true);
    expect(await r.commit(first, 0, b!.pub)).toBe(false); // the same one again, forwarded
    expect([...r.flagged]).toEqual([]);
  });

  it('keeps a second signed commit of a key as the proof it equivocated: the seat holds and is flagged', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const one = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const two = await commitOrder(a!, { game: 'g', round: 1, order: B });
    const three = (await commitOrder(a!, { game: 'g', round: 1, order: HOLD })).commit;
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    // Both arrive together and both are kept, to be forwarded: they are the proof.
    expect(await Promise.all([r.commit(one.commit, 0, a!.pub), r.commit(two.commit, 0, a!.pub)])).toEqual([true, true]);
    expect([...r.flagged]).toEqual([a!.pub]);
    expect(await r.commit(three, 0, a!.pub)).toBe(false); // two are enough
    expect(await r.reveal(one.reveal, 0, a!.pub)).toBe(false); // nothing it reveals counts
    await r.commit(pb.commit, 0, b!.pub);
    await r.reveal(pb.reveal, 0, b!.pub);
    expect(r.orders(0)).toEqual([HOLD, B]); // a needs no reveal to hold
  });

  it('holds a seat proven to equivocate even after its order was revealed', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const one = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const two = (await commitOrder(a!, { game: 'g', round: 1, order: B })).commit;
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    await r.commit(one.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    expect(await r.reveal(one.reveal, 0, a!.pub)).toBe(true);
    expect(await r.commit(two, 0, b!.pub)).toBe(true); // forwarded by b before its reveal
    await r.reveal(pb.reveal, 0, b!.pub);
    expect(r.orders(0)).toEqual([HOLD, B]);
    expect([...r.flagged]).toEqual([a!.pub]);
  });

  it('once the reveal started, takes the proof only from another seat that has not revealed to it yet', async () => {
    const [a, b, c] = await seats(3);
    const r = book([a!, b!, c!]);
    const one = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const two = (await commitOrder(a!, { game: 'g', round: 1, order: B })).commit;
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    const pc = await commitOrder(c!, { game: 'g', round: 1, order: A });
    await r.commit(one.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    await r.commit(pc.commit, 0, c!.pub);
    expect(r.revealing(0)).toBe(true);
    await r.reveal(pb.reveal, 0, b!.pub);
    // Too late for the other peers to hold it too: from a itself, from b that already revealed, from a key without a seat.
    expect(await r.commit(two, 0, a!.pub)).toBe(false);
    expect(await r.commit(two, 0, b!.pub)).toBe(false);
    expect(await r.commit(two, 0, 'nobody')).toBe(false);
    // c sent it before its reveal, so every honest peer gets it before c's reveal.
    expect(await r.commit(two, 0, c!.pub)).toBe(true);
    expect([...r.flagged]).toEqual([a!.pub]);
  });

  it('refuses a first commit once the reveal started, and any commit once the orders are given', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const two = (await commitOrder(a!, { game: 'g', round: 1, order: B })).commit;
    const pb = (await commitOrder(b!, { game: 'g', round: 1, order: A })).commit;
    await r.commit(pa.commit, 0, a!.pub);
    expect(await r.commit(pb, COMMIT_BY, b!.pub)).toBe(false);
    await r.reveal(pa.reveal, COMMIT_BY, a!.pub);
    expect(r.orders(COMMIT_BY)).toEqual([A, HOLD]);
    expect(await r.commit(two, COMMIT_BY, b!.pub)).toBe(false);
    expect(r.orders(COMMIT_BY)).toEqual([A, HOLD]);
  });
});

describe('RoundBook reveal start', () => {
  it('starts the reveal once every live seat committed', async () => {
    const ks = await seats(3);
    const r = book(ks);
    for (const k of ks.slice(0, 2)) await r.commit((await commitOrder(k, { game: 'g', round: 1, order: A })).commit, 0, k.pub);
    expect(r.revealing(1000)).toBe(false);
    await r.commit((await commitOrder(ks[2]!, { game: 'g', round: 1, order: A })).commit, 1000, ks[2]!.pub);
    expect(r.revealing(1000)).toBe(true);
  });

  it('starts the reveal at the deadline even when a seat is silent', async () => {
    const ks = await seats(3);
    const r = book(ks);
    await r.commit((await commitOrder(ks[0]!, { game: 'g', round: 1, order: A })).commit, 0, ks[0]!.pub);
    expect(r.revealing(COMMIT_BY - 1)).toBe(false);
    expect(r.revealing(COMMIT_BY)).toBe(true);
  });
});

describe('RoundBook orders', () => {
  it('gives the orders by seat once every commit is revealed, a silent seat holding', async () => {
    const [a, b, c] = await seats(3);
    const r = book([a!, b!, c!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pc = await commitOrder(c!, { game: 'g', round: 1, order: B });
    await r.commit(pa.commit, 0, a!.pub);
    await r.commit(pc.commit, 0, c!.pub);
    expect(await r.reveal(pa.reveal, COMMIT_BY, a!.pub)).toBe(true);
    expect(r.orders(COMMIT_BY)).toBeNull(); // c has not revealed yet
    expect(await r.reveal(pc.reveal, COMMIT_BY, c!.pub)).toBe(true);
    expect(r.orders(COMMIT_BY)).toEqual([A, HOLD, B]);
    expect([...r.flagged]).toEqual([]);
  });

  it('gives nothing before the reveal started, even when every commit is revealed', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    await r.commit(pa.commit, 0, a!.pub);
    expect(await r.reveal(pa.reveal, 0, a!.pub)).toBe(true); // an early reveal is kept
    expect(r.orders(0)).toBeNull();
    expect(r.orders(COMMIT_BY)).toEqual([A, HOLD]);
  });

  it('takes a forwarded reveal for the order, but waits for the reveal of the seat itself or the deadline', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    await r.commit(pa.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    await r.reveal(pa.reveal, 0, a!.pub);
    expect(await r.reveal(pb.reveal, 0, a!.pub)).toBe(true); // forwarded by a: kept, to forward
    expect(r.orders(0)).toBeNull();
    expect(await r.reveal(pb.reveal, 0, b!.pub)).toBe(false); // known already, nothing to forward
    expect(r.orders(0)).toEqual([A, B]);
  });

  it('gives the forwarded order at the reveal deadline when the seat never revealed to this peer', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    await r.commit(pa.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    await r.reveal(pa.reveal, 0, a!.pub);
    await r.reveal(pb.reveal, 0, a!.pub);
    expect(r.orders(REVEAL_BY)).toEqual([A, B]);
    expect([...r.flagged]).toEqual([]);
  });

  it('flags the sender of a reveal that does not match its commit, and holds it unless a matching one comes', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: A });
    await r.commit(pa.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    const lie = await signReveal(b!, { game: 'g', round: 1, order: B, nonce: pb.reveal.nonce });
    expect(await r.reveal(lie, 0, b!.pub)).toBe(false);
    expect([...r.flagged]).toEqual([b!.pub]);
    await r.reveal(pa.reveal, 0, a!.pub);
    expect(r.orders(0)).toBeNull(); // b may still have sent the matching reveal to another peer
    expect(r.orders(REVEAL_BY)).toEqual([A, HOLD]);
  });

  it('takes a matching reveal after a bad one, its sender staying flagged', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    await r.commit(pa.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    await r.reveal(await signReveal(b!, { game: 'g', round: 1, order: A, nonce: pb.reveal.nonce }), 0, b!.pub);
    await r.reveal(pa.reveal, 0, a!.pub);
    expect(await r.reveal(pb.reveal, 0, a!.pub)).toBe(true);
    expect(r.orders(REVEAL_BY)).toEqual([A, B]);
    expect([...r.flagged]).toEqual([b!.pub]);
  });

  it('flags the sender of a matching reveal that is not an order, and holds it', async () => {
    const [a] = await seats(1);
    const r = book([a!]);
    const odd = await commitOrder(a!, { game: 'g', round: 1, order: [1, 2, 3] });
    await r.commit(odd.commit, 0, a!.pub);
    expect(await r.reveal(odd.reveal, 0, a!.pub)).toBe(false);
    expect([...r.flagged]).toEqual([a!.pub]);
    expect(r.orders(REVEAL_BY)).toEqual([HOLD]);
  });

  it('takes an empty order as a hold', async () => {
    const [a] = await seats(1);
    const r = book([a!]);
    const hold = await commitOrder(a!, { game: 'g', round: 1, order: HOLD });
    await r.commit(hold.commit, 0, a!.pub);
    expect(await r.reveal(hold.reveal, 0, a!.pub)).toBe(true);
    expect(r.orders(0)).toEqual([HOLD]);
    expect([...r.flagged]).toEqual([]);
  });

  it('refuses without flagging a reveal it cannot pin on its sender', async () => {
    const [a, b, stranger] = await seats(3);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: A });
    await r.commit(pa.commit, 0, a!.pub);
    const forged: Reveal = { ...pa.reveal, order: B };
    const other = (await commitOrder(a!, { game: 'g', round: 2, order: A })).reveal;
    const elsewhere = (await commitOrder(a!, { game: 'h', round: 1, order: A })).reveal;
    const foreign = (await commitOrder(stranger!, { game: 'g', round: 1, order: A })).reveal;
    expect(await r.reveal(forged, 0, a!.pub)).toBe(false); // bad signature
    expect(await r.reveal(other, 0, a!.pub)).toBe(false); // another round
    expect(await r.reveal(elsewhere, 0, a!.pub)).toBe(false); // another game
    expect(await r.reveal(foreign, 0, stranger!.pub)).toBe(false); // no seat
    expect(await r.reveal(pb.reveal, 0, b!.pub)).toBe(false); // no commit
    expect([...r.flagged]).toEqual([]);
    expect(await r.reveal(pa.reveal, 0, a!.pub)).toBe(true);
  });

  it('holds and flags a committed seat that has not revealed by the reveal deadline, then takes no more reveals', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    await r.commit(pa.commit, 0, a!.pub);
    await r.commit(pb.commit, 0, b!.pub);
    await r.reveal(pa.reveal, 0, a!.pub);
    expect(r.orders(REVEAL_BY - 1)).toBeNull();
    expect(r.orders(REVEAL_BY)).toEqual([A, HOLD]);
    expect([...r.flagged]).toEqual([b!.pub]);
    expect(await r.reveal(pb.reveal, REVEAL_BY, b!.pub)).toBe(false);
    expect(r.orders(REVEAL_BY + 1)).toEqual([A, HOLD]); // sealed
  });
});

// A seeded draw, so a failing order of messages can be replayed.
function draw(seed: number): (n: number) => number {
  let s = seed;
  return (n) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  const next = draw(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = next(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('six peers, one silent and one lying', () => {
  it('gives the same orders and the same flag on every honest peer', async () => {
    const ks = await seats(6);
    const plays = [A, B, HOLD, A]; // seats 0 to 3 are honest, 4 lies, 5 is silent
    const honest = await Promise.all(plays.map((order, i) => commitOrder(ks[i]!, { game: 'g', round: 7, order })));
    const liar = await commitOrder(ks[4]!, { game: 'g', round: 7, order: A });
    const lie = await signReveal(ks[4]!, { game: 'g', round: 7, order: B, nonce: liar.reveal.nonce });
    const commits = [...honest.map((p) => p.commit), liar.commit];
    const reveals = [...honest.map((p) => p.reveal), lie];
    const results = await Promise.all(
      honest.map(async (_, i) => {
        const r = book(ks, 7);
        for (const c of shuffled(commits, i + 1)) await r.commit(c, 1000, c.pub);
        expect(r.revealing(1000)).toBe(false); // seat 5 is still awaited
        for (const v of shuffled(reveals, i + 11)) await r.reveal(v, COMMIT_BY, v.pub);
        expect(r.orders(COMMIT_BY)).toBeNull(); // seat 4 may have sent its matching reveal elsewhere
        return { orders: r.orders(REVEAL_BY), flagged: [...r.flagged] };
      }),
    );
    for (const res of results) expect(res).toEqual({ orders: [A, B, HOLD, A, HOLD, HOLD], flagged: [ks[4]!.pub] });
  });
});

// Issue #532: a full mesh of reliable, ordered channels. Seats 0 to 4 are honest peers: each forwards to the others every
// message its book keeps, and sends its own reveal once its reveal started. Seat 5 sends each peer what it likes, at
// the start. `draw` picks which channel delivers its next message, so every run is a different but legal network.
// `cheatFirst` delivers seat 5's commits before anything else.
type Message = Commit | Reveal;
const NOW = 1000;
const PLAYS = [A, B, HOLD, A, B];

async function mesh(
  ks: Keys[],
  cheat: (peer: number) => Message[],
  seed: number,
  { cheatFirst = false, late = [] as number[] } = {},
): Promise<RoundBook[]> {
  const peers = PLAYS.map((_, i) => i);
  const books = peers.map(() => book(ks, 7));
  const own = await Promise.all(PLAYS.map((order, i) => commitOrder(ks[i]!, { game: 'g', round: 7, order })));
  const queue = new Map<string, { to: number; from: number; messages: Message[] }>();
  const send = (from: number, to: number, m: Message) => {
    const key = `${from}>${to}`;
    if (!queue.has(key)) queue.set(key, { to, from, messages: [] });
    queue.get(key)!.messages.push(m);
  };
  const revealed = new Set<number>();
  const take = async (to: number, from: number, m: Message): Promise<void> => {
    const r = books[to]!;
    const kept = m.kind === 'commit' ? await r.commit(m, NOW, ks[from]!.pub) : await r.reveal(m, NOW, ks[from]!.pub);
    if (kept) for (const p of peers) if (p !== to) send(to, p, m);
    if (r.revealing(NOW) && !revealed.has(to)) {
      revealed.add(to);
      await take(to, to, own[to]!.reveal);
    }
  };
  for (const p of peers) for (const m of cheat(p)) send(5, p, m);
  if (cheatFirst) for (const p of peers) await take(p, 5, queue.get(`5>${p}`)!.messages.shift()!);
  for (const p of peers) await take(p, p, own[p]!.commit);
  const next = draw(seed);
  // A late channel (seat 5 to a peer in `late`) delivers only once every other channel is empty.
  const slow = (c: { from: number; to: number }) => c.from === 5 && late.includes(c.to);
  for (;;) {
    const busy = [...queue.values()].filter((c) => c.messages.length > 0);
    const open = busy.some((c) => !slow(c)) ? busy.filter((c) => !slow(c)) : busy;
    if (open.length === 0) break;
    const channel = open[next(open.length)]!;
    await take(channel.to, channel.from, channel.messages.shift()!);
  }
  return books;
}

// The orders a book gives at once, or at the reveal deadline when it still waits for a seat.
const final = (r: RoundBook) => r.orders(NOW) ?? r.orders(REVEAL_BY);

describe('six peers, one equivocating (#532)', () => {
  it('holds and flags on every honest peer a seat that sent two commits, when each peer got one before its reveal', async () => {
    const ks = await seats(6);
    const one = await commitOrder(ks[5]!, { game: 'g', round: 7, order: A });
    const two = await commitOrder(ks[5]!, { game: 'g', round: 7, order: B });
    for (const seed of [1, 2, 3, 4, 5]) {
      const books = await mesh(ks, (p) => (p < 3 ? [one.commit, one.reveal] : [two.commit, two.reveal]), seed, { cheatFirst: true });
      for (const r of books) expect({ orders: r.orders(NOW), flagged: [...r.flagged] }).toEqual({ orders: [...PLAYS, HOLD], flagged: [ks[5]!.pub] });
    }
  });

  it('gives the same orders on every honest peer whatever the network does with two commits', async () => {
    const ks = await seats(6);
    const one = await commitOrder(ks[5]!, { game: 'g', round: 7, order: A });
    const two = await commitOrder(ks[5]!, { game: 'g', round: 7, order: B });
    for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
      const orders = (await mesh(ks, (p) => (p % 2 === 0 ? [one.commit, one.reveal] : [two.commit, two.reveal]), seed)).map(final);
      for (const o of orders) expect(o).toEqual(orders[0]);
    }
  });

  it('gives the same orders on every honest peer when some get the second commit only after their own reveal', async () => {
    const ks = await seats(6);
    const one = await commitOrder(ks[5]!, { game: 'g', round: 7, order: A });
    const two = await commitOrder(ks[5]!, { game: 'g', round: 7, order: B });
    for (const seed of [31, 32, 33, 34, 35]) {
      // Peers 3 and 4 get the first commit forwarded and reveal; the second reaches them too late to be held everywhere.
      const books = await mesh(ks, (p) => (p < 3 ? [one.commit, one.reveal] : [two.commit, two.reveal]), seed, { late: [3, 4] });
      for (const r of books) expect(final(r)).toEqual([...PLAYS, A]);
    }
  });

  it('gives the matching order on every honest peer when the seat sent a bad reveal to some', async () => {
    const ks = await seats(6);
    const p5 = await commitOrder(ks[5]!, { game: 'g', round: 7, order: B });
    const lie = await signReveal(ks[5]!, { game: 'g', round: 7, order: A, nonce: p5.reveal.nonce });
    for (const seed of [21, 22, 23, 24, 25]) {
      const books = await mesh(ks, (p) => [p5.commit, p < 2 ? p5.reveal : lie], seed);
      for (const r of books) expect(final(r)).toEqual([...PLAYS, B]);
    }
  });
});

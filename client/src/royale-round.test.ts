import { describe, expect, it } from 'vitest';
import { generateKeys, type Keys } from './moverecord';
import { commitOrder, hashOrder, RoundBook, signReveal, verifyCommit, verifyReveal, type Commit, type Reveal } from './royale-round';

// Issue #500, docs/specs/tech.md section 6 (Battle royale): commit, then reveal, then the round's orders. No test here
// waits for a time: `now` is a number the test moves.
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
    expect(await r.commit(commit, 0)).toBe(true);
  });

  it('refuses a commit for the wrong round or game, a second commit, a bad signature or a key without a seat', async () => {
    const [a, b, stranger] = await seats(3);
    const r = book([a!, b!]);
    const wrongRound = (await commitOrder(a!, { game: 'g', round: 2, order: A })).commit;
    const wrongGame = (await commitOrder(a!, { game: 'h', round: 1, order: A })).commit;
    const first = (await commitOrder(a!, { game: 'g', round: 1, order: A })).commit;
    const second = (await commitOrder(a!, { game: 'g', round: 1, order: B })).commit;
    const foreign = (await commitOrder(stranger!, { game: 'g', round: 1, order: A })).commit;
    const forged: Commit = { ...(await commitOrder(b!, { game: 'g', round: 1, order: A })).commit, hash: first.hash };
    expect(await r.commit(wrongRound, 0)).toBe(false);
    expect(await r.commit(wrongGame, 0)).toBe(false);
    expect(await r.commit(foreign, 0)).toBe(false);
    expect(await r.commit(forged, 0)).toBe(false);
    expect(await r.commit(first, 0)).toBe(true);
    expect(await r.commit(second, 0)).toBe(false);
    expect(await r.commit(first, 0)).toBe(false); // the same one again too
  });

  it('keeps one of two commits of a key that arrive together', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const one = (await commitOrder(a!, { game: 'g', round: 1, order: A })).commit;
    const two = (await commitOrder(a!, { game: 'g', round: 1, order: B })).commit;
    // Either may win: the signature checks run concurrently. Which one stays is #532's equivocation gap.
    expect((await Promise.all([r.commit(one, 0), r.commit(two, 0)])).filter(Boolean)).toHaveLength(1);
  });

  it('refuses a commit once the reveal started', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const { commit } = await commitOrder(a!, { game: 'g', round: 1, order: A });
    expect(await r.commit(commit, COMMIT_BY)).toBe(false);
  });
});

describe('RoundBook reveal start', () => {
  it('starts the reveal once every live seat committed', async () => {
    const ks = await seats(3);
    const r = book(ks);
    for (const k of ks.slice(0, 2)) await r.commit((await commitOrder(k, { game: 'g', round: 1, order: A })).commit, 0);
    expect(r.revealing(1000)).toBe(false);
    await r.commit((await commitOrder(ks[2]!, { game: 'g', round: 1, order: A })).commit, 1000);
    expect(r.revealing(1000)).toBe(true);
  });

  it('starts the reveal at the deadline even when a seat is silent', async () => {
    const ks = await seats(3);
    const r = book(ks);
    await r.commit((await commitOrder(ks[0]!, { game: 'g', round: 1, order: A })).commit, 0);
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
    await r.commit(pa.commit, 0);
    await r.commit(pc.commit, 0);
    expect(await r.reveal(pa.reveal, COMMIT_BY)).toBe(true);
    expect(r.orders(COMMIT_BY)).toBeNull(); // c has not revealed yet
    expect(await r.reveal(pc.reveal, COMMIT_BY)).toBe(true);
    expect(r.orders(COMMIT_BY)).toEqual([A, HOLD, B]);
    expect([...r.flagged]).toEqual([]);
  });

  it('gives nothing before the reveal started, even when every commit is revealed', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    await r.commit(pa.commit, 0);
    expect(await r.reveal(pa.reveal, 0)).toBe(true); // an early reveal is kept
    expect(r.orders(0)).toBeNull();
    expect(r.orders(COMMIT_BY)).toEqual([A, HOLD]);
  });

  it('turns a reveal that does not match its commit into a hold and flags the sender', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: A });
    await r.commit(pa.commit, 0);
    await r.commit(pb.commit, 0);
    const lie = await signReveal(b!, { game: 'g', round: 1, order: B, nonce: pb.reveal.nonce });
    expect(await r.reveal(lie, 0)).toBe(false);
    expect([...r.flagged]).toEqual([b!.pub]);
    expect(await r.reveal(pb.reveal, 0)).toBe(false); // the first reveal of a key is final
    await r.reveal(pa.reveal, 0);
    expect(r.orders(0)).toEqual([A, HOLD]);
  });

  it('turns a matching reveal that is not an order into a hold and flags the sender', async () => {
    const [a] = await seats(1);
    const r = book([a!]);
    const odd = await commitOrder(a!, { game: 'g', round: 1, order: [1, 2, 3] });
    await r.commit(odd.commit, 0);
    expect(await r.reveal(odd.reveal, 0)).toBe(false);
    expect([...r.flagged]).toEqual([a!.pub]);
    expect(r.orders(0)).toEqual([HOLD]);
  });

  it('takes an empty order as a hold', async () => {
    const [a] = await seats(1);
    const r = book([a!]);
    const hold = await commitOrder(a!, { game: 'g', round: 1, order: HOLD });
    await r.commit(hold.commit, 0);
    expect(await r.reveal(hold.reveal, 0)).toBe(true);
    expect(r.orders(0)).toEqual([HOLD]);
    expect([...r.flagged]).toEqual([]);
  });

  it('refuses without flagging a reveal it cannot pin on its sender', async () => {
    const [a, b, stranger] = await seats(3);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: A });
    await r.commit(pa.commit, 0);
    const forged: Reveal = { ...pa.reveal, order: B };
    const other = (await commitOrder(a!, { game: 'g', round: 2, order: A })).reveal;
    const elsewhere = (await commitOrder(a!, { game: 'h', round: 1, order: A })).reveal;
    const foreign = (await commitOrder(stranger!, { game: 'g', round: 1, order: A })).reveal;
    expect(await r.reveal(forged, 0)).toBe(false); // bad signature
    expect(await r.reveal(other, 0)).toBe(false); // another round
    expect(await r.reveal(elsewhere, 0)).toBe(false); // another game
    expect(await r.reveal(foreign, 0)).toBe(false); // no seat
    expect(await r.reveal(pb.reveal, 0)).toBe(false); // no commit
    expect([...r.flagged]).toEqual([]);
    expect(await r.reveal(pa.reveal, 0)).toBe(true);
  });

  it('holds and flags a committed seat that has not revealed by the reveal deadline, then takes no more reveals', async () => {
    const [a, b] = await seats(2);
    const r = book([a!, b!]);
    const pa = await commitOrder(a!, { game: 'g', round: 1, order: A });
    const pb = await commitOrder(b!, { game: 'g', round: 1, order: B });
    await r.commit(pa.commit, 0);
    await r.commit(pb.commit, 0);
    await r.reveal(pa.reveal, 0);
    expect(r.orders(REVEAL_BY - 1)).toBeNull();
    expect(r.orders(REVEAL_BY)).toEqual([A, HOLD]);
    expect([...r.flagged]).toEqual([b!.pub]);
    expect(await r.reveal(pb.reveal, REVEAL_BY)).toBe(false);
    expect(r.orders(REVEAL_BY + 1)).toEqual([A, HOLD]); // sealed
  });
});

// Every message reaches every peer, in an order of its own: the honest books must agree.
function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
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
        for (const c of shuffled(commits, i + 1)) await r.commit(c, 1000);
        expect(r.revealing(1000)).toBe(false); // seat 5 is still awaited
        for (const v of shuffled(reveals, i + 11)) await r.reveal(v, COMMIT_BY);
        return { orders: r.orders(COMMIT_BY), flagged: [...r.flagged] };
      }),
    );
    for (const res of results) expect(res).toEqual({ orders: [A, B, HOLD, A, HOLD, HOLD], flagged: [ks[4]!.pub] });
  });
});

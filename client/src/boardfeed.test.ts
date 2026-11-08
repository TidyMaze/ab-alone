import { describe, expect, it, vi } from 'vitest';
import init, { Engine, replay_score } from 'edgefall-wasm';
import banned from './bannedkeys.json';
import { retireTimes, BANNED, banSet, JUNK_BUDGET, LIMIT, MAX_FAILS_PER_KEY, MIN_GAMES, MIN_OPPONENTS, RAMP_GAMES, capPairs, REPLAY_BUDGET, RELAYS, WINDOW_S, bothSigned, deriveBoard, parseResult, readBoard, readRelay, sharedHtml, signResult, verifiedResults, type SharedResult, type Socket } from './boardfeed';
import { boardKeys, joinBoard, leaveBoard, signRetire, type RetireEvent } from './shareboard';
import { generateKeys, type Keys } from './moverecord';

// The replay is the real rules engine (crates/edgefall-wasm replay_score), as antistalling.test.ts: Node's fetch cannot read a file:// URL.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
await init({ module_or_path: await readFile(new URL('../../crates/edgefall-wasm/pkg/edgefall_wasm_bg.wasm', import.meta.url)) });

const play = (plies: number): { moves: number[][]; status: number; ejected: [number, number] } => {
  const engine = new Engine();
  const moves: number[][] = [];
  for (let i = 0; i < plies; i++) {
    const mv = engine.best_move(20);
    if (mv.length === 0) break;
    engine.play(mv);
    moves.push([...mv]);
  }
  return { moves, status: engine.status(), ejected: [engine.ejected(1), engine.ejected(2)] };
};
const ended = play(400);
const short = play(6);
const result = (over: Partial<SharedResult> = {}, from = ended): SharedResult => ({
  v: 1, game: 'g1', black: { pub: 'A', name: 'Ann' }, white: { pub: 'B', name: 'Bob' },
  moves: from.moves, status: from.status, ejected: from.ejected, ts: 100, sigs: { black: 'x', white: 'y' }, ...over,
});
// A result signed by two real seats (#1317): the keys are the pubs, each seat signs as its own colour.
const [kA, kB, kC] = [await generateKeys(), await generateKeys(), await generateKeys()] as [Keys, Keys, Keys];
const signed = async (over: Partial<SharedResult> = {}, from = ended, by: [Keys, Keys] = [kA, kB]): Promise<SharedResult> => {
  const base = result({ black: { pub: kA.pub, name: 'Ann' }, white: { pub: kB.pub, name: 'Bob' }, ...over }, from);
  return { ...base, sigs: { black: await signResult(by[0], base), white: await signResult(by[1], base) } };
};
const NOW = 1000; // every test result is dated 100 to 200
const score = (flat: Int32Array): Uint8Array => replay_score(flat);

describe('the shared board read side (#1287)', () => {
  it('the game it replays ended, so a result can be built from it', () => {
    expect(ended.status).not.toBe(0);
  });

  it('parses a result and refuses what is not one', () => {
    const ok = result();
    expect(parseResult(JSON.stringify(ok))).toEqual(ok);
    expect(parseResult(JSON.stringify({ ...ok, black: { pub: 'A', name: ' Ann\u0000 '.repeat(9) } }))!.black.name).toHaveLength(16);
    const bad: unknown[] = [
      'not json', 'null', '3',
      { ...ok, v: 2 }, { ...ok, game: 1 }, { ...ok, black: null }, { ...ok, black: { pub: 1, name: 'x' } }, { ...ok, black: { pub: 'A', name: 5 } },
      { ...ok, white: { pub: 'A', name: 'Bob' } },
      { ...ok, moves: 'x' }, { ...ok, moves: [[1, 2]] }, { ...ok, moves: [Array(8).fill(1.5)] }, { ...ok, moves: [Array(8).fill('a')] },
      { ...ok, moves: Array.from({ length: 1001 }, () => Array(8).fill(0)) },
      { ...ok, sigs: undefined }, { ...ok, sigs: { black: 'x' } }, { ...ok, sigs: { black: 1, white: 'y' } }, { ...ok, sigs: { black: 'x', white: 2 } },
      { ...ok, status: 0 }, { ...ok, status: 4 }, { ...ok, ejected: [1] }, { ...ok, ejected: [1, 'x'] }, { ...ok, ts: 'x' },
    ];
    for (const b of bad) expect(parseResult(typeof b === 'string' ? b : JSON.stringify(b))).toBeNull();
  });

  it('keeps a result only if both seats signed it and the rules replay its log to the same status and ejections, once per game', async () => {
    const good = await signed();
    const lies = await Promise.all([
      signed({ game: 'g2', status: ended.status === 1 ? 2 : 1 }),
      signed({ game: 'g3', ejected: [ended.ejected[0] + 1, ended.ejected[1]] }),
      signed({ game: 'g4', moves: [[1, 0, 0, 0, 0, 0, 0, 0]] }),
      signed({ game: 'g5', status: 1, ejected: [6, 0] }, short),
    ]);
    const twice = await signed({ ts: 200 });
    expect(await verifiedResults([...lies.map((l) => JSON.stringify(l)), 'junk'], score, NOW)).toEqual([]);
    expect(await verifiedResults([JSON.stringify(good), 'junk', JSON.stringify(twice)], score, NOW)).toEqual([good]);
  });

  it('refuses a result a seat did not sign: one seat, swapped seats, an outsider, a changed field, a borrowed key (#1317)', async () => {
    const good = await signed();
    expect(await bothSigned(good)).toBe(true);
    const other = await signed({ game: 'other' });
    const forged: SharedResult[] = [
      { ...good, sigs: { black: good.sigs.black, white: 'AAAA' } }, // the loser never signed
      { ...good, sigs: { black: 'not base64 !', white: good.sigs.white } },
      { ...good, sigs: { black: good.sigs.white, white: good.sigs.black } }, // seats swapped
      { ...good, sigs: { black: good.sigs.black, white: other.sigs.white } }, // a signature of another game
      await signed({}, ended, [kA, kC]), // an outsider signs for white
      { ...good, status: good.status === 1 ? 2 : 1 }, // outcome changed after signing
      { ...good, black: { pub: good.black.pub, name: 'Mallory' } }, // renamed
      { ...good, moves: [...good.moves].reverse() },
      { ...good, ts: good.ts + 1 },
      { ...good, game: 'moved' },
    ];
    // Anyone can credit a game to a victim's key, but cannot sign for it: black = the victim kC, signatures by the attacker's keys.
    const victim = await signed({ black: { pub: kC.pub, name: 'Carl' }, white: { pub: kB.pub, name: 'Bob' } });
    forged.push(victim);
    for (const f of forged) expect(await bothSigned(f)).toBe(false);
    expect(await verifiedResults(forged.map((f) => JSON.stringify(f)), score, NOW)).toEqual([]);
    // A forged event does not squat the game id: the real result with the same id still counts.
    expect(await verifiedResults([JSON.stringify(forged[0]), JSON.stringify(good)], score, NOW)).toEqual([good]);
  });

  it('a signed junk event reusing a game id and two other keys does not hide the honest result', async () => {
    const good = await signed();
    const squat = await signed({ moves: [[1, 0, 0, 0, 0, 0, 0, 0]], black: { pub: kC.pub, name: 'X' }, white: { pub: kB.pub, name: 'Y' } }, ended, [kC, kB]);
    expect(squat.game).toBe(good.game);
    expect(await verifiedResults([JSON.stringify(squat), JSON.stringify(good)], score, NOW)).toEqual([good]);
  });

  it('ignores the results of a banned key, in either seat, and ships a well formed list', async () => {
    const good = await signed();
    const other = await signed({ game: 'g9', black: { pub: kC.pub, name: 'Cy' } }, ended, [kC, kB]);
    const raw = [JSON.stringify(good), JSON.stringify(other)];
    expect(await verifiedResults(raw, score, NOW, new Set([kA.pub]))).toEqual([other]);
    expect(await verifiedResults(raw, score, NOW, new Set([kB.pub]))).toEqual([]);
    expect(await verifiedResults(raw, score, NOW, new Set())).toHaveLength(2);
    expect(banned.v).toBe(1);
    for (const b of banned.banned as { pub: string; reason: string; date: string }[]) expect([typeof b.pub, b.reason.length > 0, /^\d{4}-\d\d-\d\d$/.test(b.date)]).toEqual(['string', true, true]);
    expect((await BANNED).size).toBe(banned.banned.length);
    expect(await verifiedResults(raw, score, NOW)).toHaveLength(2); // no list given: the shipped one, signed and verified
    expect([...banSet([{ pub: 'P', reason: 'r', date: '2026-11-03' }])]).toEqual(['P']);
  });

  it('honours the retire that leaveBoard stores, for later results only, the earliest one, and refuses a forged one', async () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as Storage;
    await joinBoard(store, 'Ann');
    const kP = await boardKeys(store);
    const mine = (game: string, ts: number): Promise<SharedResult> => signed({ game, ts, black: { pub: kP.pub, name: 'Ann' } }, ended, [kP, kB]);
    const raw = (await Promise.all([mine('e', 100), mine('a', 200), mine('l', 300)])).map((r) => JSON.stringify(r));
    const retire = JSON.stringify(await leaveBoard(store, 200_000)); // the event the player publishes, at 200 s
    const kept = async (...extra: string[]): Promise<string[]> => (await verifiedResults([...raw, ...extra], score, NOW, new Set())).map((r) => r.game);
    expect(await kept()).toEqual(['e', 'a', 'l']);
    expect(await kept(retire)).toEqual(['e', 'a']);
    const other = JSON.stringify(await signRetire(kB, 150));
    expect(await kept(other)).toEqual(['e']); // the opponent's retire hides the games after it too
    expect(await kept(retire, JSON.stringify(await signRetire(kP, 150)), JSON.stringify(await signRetire(kP, 400)))).toEqual(['e']);
    // Altered after signing, or signed by another key: nothing hidden.
    const moved = { ...(JSON.parse(retire) as RetireEvent), at: 0 };
    const forged = { ...(JSON.parse(retire) as RetireEvent), pub: kA.pub };
    expect(await kept(JSON.stringify(moved), JSON.stringify(forged))).toEqual(['e', 'a', 'l']);
    const ok = JSON.parse(retire) as Record<string, unknown>;
    const bad = ['junk', 'null', '{}', ...[{ v: 2 }, { kind: 'x' }, { pub: 1 }, { sig: 5 }, { at: 'x' }, { at: null }].map((o) => JSON.stringify({ ...ok, ...o }))];
    expect([...(await retireTimes(bad))]).toEqual([]);
  });

  it('replays a game once even when it is refused, and stops at the budget of plies', async () => {
    const calls: number[] = [];
    const counting = (flat: Int32Array): Uint8Array => (calls.push(flat.length / 8), new Uint8Array());
    const bad = JSON.stringify(await signed({ game: 'dup', status: 1 }));
    await verifiedResults([bad, bad, bad], counting, NOW);
    expect(calls).toHaveLength(1);
    calls.length = 0;
    const pairs = async (): Promise<[Keys, Keys]> => [await generateKeys(), await generateKeys()];
    const big = async (game: string, by: [Keys, Keys]): Promise<string> =>
      JSON.stringify(await signed({ game, black: { pub: by[0].pub, name: 'X' }, white: { pub: by[1].pub, name: 'Y' }, moves: Array.from({ length: 1000 }, () => Array(8).fill(0)) }, ended, by));
    await verifiedResults(await Promise.all(Array.from({ length: 30 }, async (_, i) => big(`b${i}`, await pairs()))), counting, NOW);
    expect(calls).toHaveLength(JUNK_BUDGET / 1000);
    expect(parseResult(JSON.stringify(result()).replace('"ts":100', '"ts":1e999'))).toBeNull();
  });

  it('results that do not replay never use up the budget of honest ones, and a key whose replays fail is heard twice at most', async () => {
    const junkOf = async (i: number, by: [Keys, Keys]): Promise<string> =>
      JSON.stringify(await signed({ game: `j${i}`, black: { pub: by[0].pub, name: 'X' }, white: { pub: by[1].pub, name: 'Y' }, moves: Array.from({ length: 1000 }, () => Array(8).fill(0)), status: 1 }, ended, by));
    const flood = await Promise.all(Array.from({ length: 25 }, async (_, i) => junkOf(i, [await generateKeys(), await generateKeys()])));
    const good = await signed({ game: 'honest' });
    expect(await verifiedResults([...flood, JSON.stringify(good)].slice(0, 20).concat(JSON.stringify(good)), score, NOW)).toEqual([good]);
    // One pair of keys sending many junk results: only MAX_FAILS_PER_KEY of them are replayed.
    const calls: number[] = [];
    const counting = (flat: Int32Array): Uint8Array => (calls.push(flat.length), new Uint8Array());
    const mine: [Keys, Keys] = [await generateKeys(), await generateKeys()];
    await verifiedResults(await Promise.all(Array.from({ length: 6 }, (_, i) => junkOf(100 + i, mine))), counting, NOW);
    expect(calls).toHaveLength(MAX_FAILS_PER_KEY);
  });

  it('a result dated outside the window is not replayed, so old ones use no budget', async () => {
    const calls: number[] = [];
    const counting = (flat: Int32Array): Uint8Array => (calls.push(flat.length), new Uint8Array());
    const old = JSON.stringify(await signed({ game: 'old', ts: 10 }));
    const now = JSON.stringify(await signed({ game: 'now', ts: 2 * WINDOW_S }));
    await verifiedResults([old, now], counting, 2 * WINDOW_S);
    expect(calls).toHaveLength(1);
  });

  it('derives the ratings by replaying the valid results in order from 1200, never reading one', () => {
    const w = (game: string, ts: number, status: number, a = 'A', b = 'B'): SharedResult =>
      result({ game, ts, status, black: { pub: a, name: a }, white: { pub: b, name: b } });
    // A beats B, A beats C (white), then A and B draw.
    const rows = deriveBoard([w('g3', 3, 3), w('g1', 1, 1), w('g2', 2, 2, 'C', 'A')], 0, 0, 0);
    expect(rows.map((r) => [r.rank, r.pub, r.rating])).toEqual([[1, 'A', 1229], [2, 'B', 1186], [3, 'C', 1185]]);
    expect(deriveBoard([])).toEqual([]);
    // Two games at the same second: the game id orders them, whatever the order they arrived in.
    const same = [w('s2', 5, 1, 'P', 'Q'), w('s1', 5, 2, 'P', 'Q')];
    expect(deriveBoard(same, 0, 0, 0)).toEqual(deriveBoard([...same].reverse(), 0, 0, 0));
    // Same rating: the name decides. The latest name a key gave is the one shown.
    const tie = deriveBoard([w('t1', 1, 3, 'X', 'Y'), result({ game: 't2', ts: 2, status: 3, black: { pub: 'X', name: 'Zed' }, white: { pub: 'Y', name: 'Yan' } })], 0, 0, 0);
    expect(tie.map((r) => r.name)).toEqual(['Yan', 'Zed']);
  });

  it('counts at most 3 results a day for one pair of keys, in either colour, first ones first', () => {
    const w = (game: string, ts: number, a = 'A', b = 'B'): SharedResult => result({ game, ts, status: 1, black: { pub: a, name: a }, white: { pub: b, name: b } });
    const day = 86400;
    const five = [w('1', 10), w('2', 20, 'B', 'A'), w('3', 30), w('4', 40), w('5', 50, 'B', 'A')];
    expect(capPairs(five).map((r) => r.game)).toEqual(['1', '2', '3']);
    expect(capPairs([...five].reverse()).map((r) => r.game)).toEqual(['1', '2', '3']);
    // A new UTC day and another pair start again.
    expect(capPairs([...five, w('6', day + 1), w('7', 60, 'A', 'C')]).map((r) => r.game)).toEqual(['1', '2', '3', '7', '6']);
    expect(deriveBoard(five, 0, 0, 0).map((r) => r.rating)).toEqual(deriveBoard(five.slice(0, 3), 0, 0, 0).map((r) => r.rating));
  });

  it('scales a rating change by the opponent\'s counted games and shows a key after 10 games (ranked F3)', () => {
    const w = (game: string, ts: number, a: string, b: string): SharedResult => result({ game, ts, status: 1, black: { pub: a, name: a }, white: { pub: b, name: b } });
    expect([MIN_GAMES, RAMP_GAMES]).toEqual([10, 10]);
    // A win over a fresh key (0 counted games) gains 0 for the winner; the loser still pays.
    const one = deriveBoard([w('a', 1, 'A', 'B')], 0, 0);
    expect(one.find((r) => r.pub === 'A')!.rating).toBe(1200);
    // Ring of 6 keys, every pair 3 games a day (the cap), the lower index always winning.
    const keys = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];
    const ring = (perPair: number): SharedResult[] => keys.flatMap((x, i) => keys.slice(i + 1).flatMap((y, j) => Array.from({ length: perPair }, (_, n) => w(`${x}${y}${n}`, 1 + n, x, y))));
    // 1 game per pair: 5 games per key, below the display rule even with 5 opponents.
    expect(deriveBoard(ring(1))).toEqual([]);
    // 3 per pair (the cap): 15 games per key, shown; extra games of the same pair and day add nothing.
    const capped = deriveBoard(ring(3));
    expect(capped).toHaveLength(6);
    expect(deriveBoard(ring(9))).toEqual(capped);
    // The ramp holds the winner back: K0 gains less than an unscaled Elo run would give.
    expect(capped[0]!.rating).toBeLessThan(deriveBoard(ring(3), MIN_OPPONENTS, MIN_GAMES, 0)[0]!.rating);
  });

  it('ranks a key only after counted results against 5 distinct opponents', () => {
    const w = (game: string, a: string, b: string): SharedResult => result({ game, ts: 1, status: 1, black: { pub: a, name: a }, white: { pub: b, name: b } });
    const four = ['B', 'C', 'D', 'E'].map((o) => w(`g${o}`, 'A', o));
    expect(deriveBoard(four, MIN_OPPONENTS, 0, 0)).toEqual([]);
    const five = [...four, w('gF', 'A', 'F')];
    expect(deriveBoard(five, MIN_OPPONENTS, 0, 0).map((r) => [r.rank, r.pub])).toEqual([[1, 'A']]);
    // The same opponent three times in a day is one opponent.
    expect(deriveBoard([...four, w('x1', 'A', 'B'), w('x2', 'A', 'B')], MIN_OPPONENTS, 0, 0)).toEqual([]);
    expect(MIN_OPPONENTS).toBe(5);
  });

  it('shows the rows with names escaped, and mine marked', () => {
    const html = sharedHtml([{ rank: 1, pub: 'A', name: '<b>x</b>', rating: 1216 }, { rank: 2, pub: 'B', name: 'Bob', rating: 1184 }], 'B');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x');
    expect(html).toContain('data-me="true"');
    expect(sharedHtml([], 'B')).toContain('No replayed result');
    expect(sharedHtml([{ rank: 1, pub: 'A', name: 'a&"\'', rating: 1200 }], 'B')).toContain('a&amp;&quot;&#39;');
  });
});

class Fake implements Socket {
  sent: string[] = [];
  closed = false;
  private on = new Map<string, ((e: { data?: string }) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, fn: (e: { data?: string }) => void): void {
    this.on.set(type, [...(this.on.get(type) ?? []), fn]);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data?: string): void {
    for (const fn of this.on.get(type) ?? []) fn({ data });
  }
}
const event = (content: unknown, over: Record<string, unknown> = {}): string =>
  JSON.stringify(['EVENT', 'ab-board', { kind: 1, tags: [['t', 'ab-alone-ranked']], content, ...over }]);

describe('reading the relays (#1287, read only)', () => {
  it('asks once, for the last 7 days of the ranked tag, takes the events until EOSE and closes', async () => {
    const sock = new Fake('wss://x');
    const done = readRelay(() => sock, 1_000_000);
    sock.emit('open');
    expect(JSON.parse(sock.sent[0]!)).toEqual(['REQ', 'ab-board', { kinds: [1], '#t': ['ab-alone-ranked'], since: 1_000_000 - WINDOW_S, limit: LIMIT }]);
    sock.emit('message', event('one'));
    sock.emit('message', event('wrong kind', { kind: 7 }));
    sock.emit('message', event('wrong tag', { tags: [['t', 'other']] }));
    sock.emit('message', event('no tags', { tags: 3 }));
    sock.emit('message', event(5));
    sock.emit('message', JSON.stringify(['EVENT', 'other-sub', { kind: 1, tags: [['t', 'ab-alone-ranked']], content: 'x' }]));
    sock.emit('message', JSON.stringify(['NOTICE', 'hi']));
    sock.emit('message', 'not json');
    sock.emit('message', JSON.stringify('str'));
    sock.emit('message', JSON.stringify(['EVENT', 'ab-board', null]));
    sock.emit('message', event('two'));
    sock.emit('message', JSON.stringify(['EOSE', 'ab-board']));
    expect(await done).toEqual(['one', 'two']);
    expect(sock.closed).toBe(true);
    expect(sock.sent.map((s) => (JSON.parse(s) as string[])[0])).toEqual(['REQ', 'CLOSE']);
    sock.emit('message', event('late')); // after the end nothing changes
    sock.emit('close');
    expect(sock.sent).toHaveLength(2);
  });

  it('ends at a CLOSED or a rate limit notice, an error, a close, or the time limit', async () => {
    for (const how of ['closed', 'notice', 'error', 'close'] as const) {
      const sock = new Fake('wss://x');
      const done = readRelay(() => sock, 1);
      sock.emit('open');
      sock.emit('message', event('kept'));
      if (how === 'closed') sock.emit('message', JSON.stringify(['CLOSED', 'ab-board', 'rate-limited: slow down']));
      else if (how === 'notice') sock.emit('message', JSON.stringify(['NOTICE', 'rate-limited: slow down']));
      else sock.emit(how);
      expect(await done).toEqual(['kept']);
    }
    vi.useFakeTimers();
    const sock = new Fake('wss://x');
    const done = readRelay(() => sock, 1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await done).toEqual([]);
    expect(sock.closed).toBe(true);
    expect(sock.sent).toEqual([]); // never opened: nothing was asked
    vi.useRealTimers();
  });

  it('a socket that cannot be made gives nothing', async () => {
    expect(await readRelay(() => { throw new Error('blocked'); }, 1)).toEqual([]);
  });

  it('reads the three chosen relays, keeps what replays, and sends no event', async () => {
    expect(RELAYS).toEqual(['wss://relay.piazza.today', 'wss://relay.bitmacro.cloud']); // the two relays of #1287
    const socks: Fake[] = [];
    const good = JSON.stringify(await signed());
    const open = (url: string): Socket => {
      const s = new Fake(url);
      socks.push(s);
      queueMicrotask(() => {
        s.emit('open');
        s.emit('message', event(good));
        s.emit('message', event(JSON.stringify(result({ game: 'bad', status: 0 }))));
        s.emit('message', event(JSON.stringify(result({ game: 'unsigned' }))));
        s.emit('message', JSON.stringify(['EOSE', 'ab-board']));
      });
      return s;
    };
    const rows = await readBoard(open, 1000, score, RELAYS, new Set(), 0, 0, 0);
    expect(socks.map((s) => s.url)).toEqual([...RELAYS]);
    expect(rows.map((r) => r.name)).toEqual(ended.status === 2 ? ['Bob', 'Ann'] : ['Ann', 'Bob']);
    for (const s of socks) expect(s.sent.every((m) => ['REQ', 'CLOSE'].includes((JSON.parse(m) as string[])[0]!))).toBe(true);
  });

  it('one relay that cannot be read (its socket throws) still reads the other (#1287)', async () => {
    const good = JSON.stringify(await signed());
    const broken = { addEventListener: () => { throw new Error('down'); }, close: () => {}, send: () => {} } as unknown as Socket;
    const open = (url: string): Socket => {
      if (url === 'down') return broken;
      const s = new Fake(url);
      queueMicrotask(() => {
        s.emit('open');
        s.emit('message', event(good));
        s.emit('message', JSON.stringify(['EOSE', 'ab-board']));
      });
      return s;
    };
    const rows = await readBoard(open, 1000, score, ['down', 'wss://relay.piazza.today'], new Set(), 0, 0, 0);
    expect(rows).toHaveLength(2);
  });

  it('ignores a result dated outside the window: far in the future, or older than 7 days', async () => {
    const mk = async (game: string, ts: number) => JSON.stringify(await signed({ game, ts }));
    const contents = [await mk('ok', 1000), await mk('future', 9e15), await mk('old', 1000 - WINDOW_S - 1), await mk('edge', 1000 + 600)];
    const open = (url: string): Socket => {
      const s = new Fake(url);
      queueMicrotask(() => {
        s.emit('open');
        for (const c of contents) s.emit('message', event(c));
        s.emit('message', JSON.stringify(['EOSE', 'ab-board']));
      });
      return s;
    };
    const rows = await readBoard(open, 1000, score, ['x'], new Set(), 1, 0, 0);
    // two games between the same pair kept (ok, edge): the other two never reach the ratings
    expect(rows.reduce((n, r) => n + r.rating, 0)).toBe(2400);
    const only = await readBoard(open, 1000, score, ['x'], new Set(), 1, 0, 0);
    expect(only).toHaveLength(2);
    expect(await readBoard((url) => open(url), 1000 + 2 * WINDOW_S, score, ['x'], new Set(), 1, 0, 0)).toEqual([]);
  });
});

import { schnorr } from '@noble/secp256k1';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELAYS, TAG, parseResult, retireTimes, type SharedResult, type Socket } from './boardfeed';
import { generateKeys } from './moverecord';
import { signRetire } from './shareboard';
import { publishResult, resultEvent, sendEvent } from './publish';

// A relay that is a stub: no test reaches the network.
const result: SharedResult = { v: 1, game: 'g', black: { pub: 'a', name: 'A' }, white: { pub: 'b', name: 'B' }, moves: [[0, 1, 2, 3, 4, 5, 6, 7]], status: 3, ejected: [0, 0], ts: 5, sigs: { black: 'x', white: 'y' } };
const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));

class Fake implements Socket {
  static all: Fake[] = [];
  sent: string[] = [];
  closed = 0;
  private on = new Map<string, ((e: { data?: string }) => void)[]>();
  constructor(readonly url: string) {
    Fake.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data?: string }) => void): void {
    this.on.set(type, [...(this.on.get(type) ?? []), fn]);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed++;
  }
  emit(type: string, data?: string): void {
    for (const fn of this.on.get(type) ?? []) fn({ data });
  }
}
const open = (url: string): Socket => new Fake(url);
afterEach(() => {
  Fake.all = [];
  vi.useRealTimers();
});

describe('publishing a ranked result (#1287)', () => {
  it('builds a valid NIP-01 event: id is the hash of the serialised event, the signature verifies, the content is the result', async () => {
    const e = await resultEvent(result, 99);
    expect(e).toMatchObject({ kind: 1, created_at: 99, tags: [['t', TAG]] });
    expect(parseResult(e.content)).toEqual(result);
    const id = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([0, e.pubkey, 99, 1, e.tags, e.content]))));
    expect(e.id).toBe(Array.from(id, (b) => b.toString(16).padStart(2, '0')).join(''));
    expect(await schnorr.verifyAsync(unhex(e.sig), id, unhex(e.pubkey))).toBe(true);
    expect((await resultEvent(result, 99)).pubkey).not.toBe(e.pubkey); // a fresh author each time
  });

  it('wraps a key\'s signed retire the same way, and the reader takes it back', async () => {
    const keys = await generateKeys();
    const retire = await signRetire(keys, 500);
    const e = await resultEvent(retire, 600);
    expect(e.tags).toEqual([['t', TAG]]);
    expect([...(await retireTimes([e.content]))]).toEqual([[keys.pub, 500]]);
  });

  it('sends one EVENT per relay and counts those that say OK; a refusal, a notice, an error, a close or count for none', async () => {
    const done = publishResult(open, result, 7);
    await vi.waitFor(() => expect(Fake.all).toHaveLength(2));
    expect(Fake.all.map((s) => s.url)).toEqual([...RELAYS]);
    const [a, b] = Fake.all as [Fake, Fake];
    for (const s of Fake.all) s.emit('open');
    const sent = JSON.parse(a.sent[0]!) as [string, { id: string; content: string }];
    expect(sent[0]).toBe('EVENT');
    expect(parseResult(sent[1].content)).toEqual(result);
    expect(a.sent).toHaveLength(1);
    a.emit('message', JSON.stringify(['OK', sent[1].id, true, '']));
    b.emit('message', 'not json');
    b.emit('message', JSON.stringify({}));
    b.emit('message', JSON.stringify(['OK', 'other', true]));
    b.emit('message', JSON.stringify(['OK', sent[1].id, false, 'blocked']));
    b.emit('message', JSON.stringify(['OK', sent[1].id, true])); // after the end: ignored
    expect(await done).toBe(1);
    expect([a.closed, b.closed]).toEqual([1, 1]);
  });

  it('publishes nothing when the event cannot be made', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('no'));
    expect(await publishResult(open, result, 7)).toBe(0);
    expect(Fake.all).toHaveLength(0);
  });

  it('gives up on a relay that stays silent for 8 s', async () => {
    vi.useFakeTimers();
    const p = sendEvent(open, 'wss://x', await resultEvent(result, 1));
    await vi.advanceTimersByTimeAsync(7999);
    expect(Fake.all[0]!.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe(false);
    expect(Fake.all[0]!.closed).toBe(1);
  });

  it('ends on a notice, an error and a close, and a socket that cannot open is a miss', async () => {
    const event = await resultEvent(result, 1);
    for (const how of ['notice', 'error', 'close'] as const) {
      const p = sendEvent(open, 'wss://x', event);
      const s = Fake.all.at(-1)!;
      if (how === 'notice') s.emit('message', JSON.stringify(['NOTICE', 'rate-limited: slow down']));
      else s.emit(how);
      expect(await p).toBe(false);
    }
    expect(await sendEvent(() => { throw new Error('no'); }, 'wss://x', event)).toBe(false);
  });
});

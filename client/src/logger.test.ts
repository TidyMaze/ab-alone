import { describe, expect, it, vi } from 'vitest';
import { LOG_SIZE, Logger, Ring, scrub } from './logger';
import { generateKeys } from './moverecord';

const sink = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('Ring', () => {
  it('keeps every item, oldest first, until it is full', () => {
    const r = new Ring<number>(3);
    expect(r.toArray()).toEqual([]);
    r.push(1);
    r.push(2);
    expect(r.toArray()).toEqual([1, 2]);
    expect(r.dropped).toBe(0);
  });

  it('once full, overwrites the oldest item and counts it as dropped', () => {
    const r = new Ring<number>(3);
    for (let i = 1; i <= 7; i++) r.push(i);
    expect(r.toArray()).toEqual([5, 6, 7]);
    expect(r.dropped).toBe(4);
  });
});

describe('scrub', () => {
  it('drops private keys, by name and as CryptoKey objects, and keeps the public key', async () => {
    const keys = await generateKeys();
    const out = scrub({ keys, nested: { privateKey: 'x', key: keys.priv, list: [keys.priv, 1] }, pub: keys.pub });
    expect(out).toEqual({ keys: { pub: keys.pub }, nested: { list: [null, 1] }, pub: keys.pub });
  });

  it('returns a plain copy: later changes to the logged object do not reach it', () => {
    const data = { moves: [[1, 2]] };
    const out = scrub(data);
    data.moves[0]!.push(3);
    expect(out).toEqual({ moves: [[1, 2]] });
  });
});

describe('Logger', () => {
  it('keeps the last 1000 entries in memory', () => {
    expect(LOG_SIZE).toBe(1000);
    const log = new Logger(() => 0, sink());
    for (let i = 0; i < LOG_SIZE + 5; i++) log.log('debug', 'tick', { i });
    expect(log.entries).toHaveLength(LOG_SIZE);
    expect(log.entries[0]).toEqual({ t: 0, level: 'debug', event: 'tick', data: { i: 5 } });
    expect(log.dropped).toBe(5);
  });

  it('writes structured entries with a level, a rounded time and the event data', () => {
    let now = 12.4;
    const log = new Logger(() => now, sink(), 10);
    log.log('info', 'net', { state: 'open' });
    now = 99.6;
    log.log('error', 'desync');
    expect(log.entries).toEqual([
      { t: 12, level: 'info', event: 'net', data: { state: 'open' } },
      { t: 100, level: 'error', event: 'desync' },
    ]);
  });

  it('prints each entry on the console method of its level', () => {
    const out = sink();
    const log = new Logger(() => 5, out, 10);
    log.log('debug', 'a');
    log.log('info', 'b');
    log.log('warn', 'c', { reason: 'malformed' });
    log.log('error', 'd');
    expect(out.debug).toHaveBeenCalledWith('[ab-alone] a', { t: 5, level: 'debug', event: 'a' });
    expect(out.info).toHaveBeenCalledWith('[ab-alone] b', { t: 5, level: 'info', event: 'b' });
    expect(out.warn).toHaveBeenCalledWith('[ab-alone] c', { t: 5, level: 'warn', event: 'c', data: { reason: 'malformed' } });
    expect(out.error).toHaveBeenCalledWith('[ab-alone] d', { t: 5, level: 'error', event: 'd' });
  });

  it('never keeps a private key, even when one is logged by mistake', async () => {
    const keys = await generateKeys();
    const log = new Logger(() => 0, sink(), 10);
    log.log('info', 'oops', { keys });
    expect(log.entries[0]!.data).toEqual({ keys: { pub: keys.pub } });
  });
});

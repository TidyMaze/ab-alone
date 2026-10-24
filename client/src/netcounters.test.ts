import { describe, expect, it } from 'vitest';
import { NetCounters, SIGNALING_TIMEOUT_MS, joinErrorCause } from './netcounters';

// A clock the test moves by hand.
function counters() {
  const clock = { now: 0 };
  return { clock, net: new NetCounters(() => clock.now) };
}

describe('NetCounters', () => {
  it('starts at zero', () => {
    expect(new NetCounters(() => 0).counts).toEqual({ opened: 0, failures: {}, connectMs: [], refused: {}, desync: 0 });
  });

  it('counts an opened connection and its time to connect', () => {
    const { clock, net } = counters();
    clock.now = 100;
    net.connecting();
    clock.now = 1350.6;
    net.state('open');
    expect(net.counts.opened).toBe(1);
    expect(net.counts.connectMs).toEqual([1251]);
  });

  it('counts a room that is open already once: another peer joining is not a new connection', () => {
    const { net } = counters();
    net.connecting();
    net.state('open');
    net.state('open');
    expect(net.counts.opened).toBe(1);
    expect(net.counts.connectMs).toEqual([0]);
  });

  it('counts an open with no connecting start, without a time to connect', () => {
    const { net } = counters();
    net.state('open');
    expect(net.counts.opened).toBe(1);
    expect(net.counts.connectMs).toEqual([]);
  });

  it('counts a lost connection, then times the reconnection from the loss', () => {
    const { clock, net } = counters();
    net.connecting();
    net.state('open');
    clock.now = 5000;
    net.state('closed');
    expect(net.counts.failures).toEqual({ lost: 1 });
    clock.now = 5400;
    net.state('open');
    expect(net.counts.opened).toBe(2);
    expect(net.counts.connectMs).toEqual([0, 400]);
  });

  it('times a connection that goes back to connecting from there, with no failure', () => {
    const { clock, net } = counters();
    net.connecting();
    net.state('open');
    clock.now = 100;
    net.state('connecting');
    clock.now = 300;
    net.state('open');
    expect(net.counts.failures).toEqual({});
    expect(net.counts.connectMs).toEqual([0, 200]);
  });

  it('ignores a close while still connecting: nothing was lost', () => {
    const { clock, net } = counters();
    net.connecting();
    clock.now = 50;
    net.state('closed');
    clock.now = 80;
    net.state('open');
    expect(net.counts.failures).toEqual({});
    expect(net.counts.connectMs).toEqual([80]);
  });

  it('counts a signaling timeout once per connecting period that lasts long enough', () => {
    const { clock, net } = counters();
    expect(net.timeout()).toBe(false); // not connecting
    net.connecting();
    clock.now = SIGNALING_TIMEOUT_MS - 1;
    expect(net.timeout()).toBe(false);
    clock.now = SIGNALING_TIMEOUT_MS;
    expect(net.timeout()).toBe(true);
    expect(net.timeout()).toBe(false);
    expect(net.counts.failures).toEqual({ 'signaling-timeout': 1 });
    // Once open, a late timer counts nothing. A new connecting period can time out again.
    net.state('open');
    clock.now = 3 * SIGNALING_TIMEOUT_MS;
    expect(net.timeout()).toBe(false);
    net.connecting();
    clock.now += 10;
    expect(net.timeout(10)).toBe(true);
    expect(net.counts.failures).toEqual({ 'signaling-timeout': 2 });
  });

  it('counts a join error by its cause', () => {
    const { net } = counters();
    expect(net.joinError('could not connect to peer abc after exchanging SDP; configure TURN servers')).toBe('ice-failed');
    expect(net.joinError('handshake timed out')).toBe('join-error');
    expect(net.counts.failures).toEqual({ 'ice-failed': 1, 'join-error': 1 });
  });

  it('counts refused messages by reason, and the desync ones apart', () => {
    const { net } = counters();
    expect(net.refuse('malformed')).toBe(false);
    expect(net.refuse('malformed')).toBe(false);
    expect(net.refuse('replayed')).toBe(false);
    for (const reason of ['bad-chain', 'out-of-order', 'illegal', 'not-their-turn']) expect(net.refuse(reason)).toBe(true);
    expect(net.counts.refused).toEqual({
      malformed: 2,
      replayed: 1,
      'bad-chain': 1,
      'out-of-order': 1,
      illegal: 1,
      'not-their-turn': 1,
    });
    expect(net.counts.desync).toBe(4);
  });

  it('hands out a copy of its counts', () => {
    const { net } = counters();
    net.counts.failures.lost = 9;
    net.counts.connectMs.push(1);
    expect(net.counts).toEqual({ opened: 0, failures: {}, connectMs: [], refused: {}, desync: 0 });
  });
});

describe('joinErrorCause', () => {
  it('reads an ICE failure in the Trystero message, anything else is a join error', () => {
    expect(joinErrorCause('could not connect to peer x after exchanging SDP; check that your TURN server URLs and credentials are reachable')).toBe('ice-failed');
    expect(joinErrorCause('incorrect room password when decrypting offer')).toBe('join-error');
  });
});

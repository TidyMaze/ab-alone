// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 20));
/** Waits (a signature takes a while on a loaded machine) until `check` holds. */
const until = (check: () => boolean): Promise<void> =>
  vi.waitFor(() => {
    if (!check()) throw new Error('not yet');
  });
import * as THREE from 'three/webgpu';
import type { PeerNet } from './p2p';
import { generateKeys } from './moverecord';
import { signBreak } from './worldevents';
import { decode, encodeBreak, encodeHello, encodePos, encodeTroop, PUBLIC_SEED, roomOf } from './worldpeers';
import { WorldPeersHost, type NetStatus } from './worldnet';

class FakeNet implements PeerNet {
  sent: [Uint8Array, string | undefined][] = [];
  closed = false;
  data: (d: Uint8Array, peer: string) => void = () => {};
  join: (peer: string) => void = () => {};
  leave: (peer: string) => void = () => {};
  fail: (message: string) => void = () => {};
  send(d: Uint8Array, to?: string): void {
    this.sent.push([d, to]);
  }
  onData(cb: (d: Uint8Array, peer: string) => void): void {
    this.data = cb;
  }
  onJoin(cb: (peer: string) => void): void {
    this.join = cb;
  }
  onLeave(cb: (peer: string) => void): void {
    this.leave = cb;
  }
  onError(cb: (message: string) => void): void {
    this.fail = cb;
  }
  close(): void {
    this.closed = true;
  }
}

function setup(allowed = true) {
  const nets: FakeNet[] = [];
  const rooms: string[] = [];
  const clock = { now: 0 };
  const reports: NetStatus[] = [];
  const applied: (readonly [number, number])[] = [];
  const keysOnce = generateKeys();
  const me = { name: '' };
  const root = document.createElement('div');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 1000);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);
  const world = { tile: () => ({ terrain: 'grass' as const, height: 1, biome: 'meadow' as const }) };
  const host = new WorldPeersHost(
    (room) => {
      rooms.push(room);
      const n = new FakeNet();
      nets.push(n);
      return n;
    },
    () => allowed,
    root,
    (status) => reports.push(status),
    () => me.name,
    { keys: () => keysOnce, canBreak: (_seed, q) => q >= 0, apply: (cell) => applied.push(cell) },
    () => clock.now,
  );
  const enter = (seed = PUBLIC_SEED) => host.enter(seed, scene, camera, world as never);
  return { host, nets, rooms, clock, root, scene, enter, reports, me, applied, keysOnce };
}

describe('WorldPeersHost', () => {
  it('joins the one room of the public seed, and only that', () => {
    const { rooms, enter } = setup();
    enter(7);
    expect(rooms).toEqual([]); // a private world touches no network
    enter();
    expect(rooms).toEqual([roomOf(PUBLIC_SEED)]);
  });

  it('contacts nobody while online play is not allowed (consent declined)', () => {
    const { rooms, host, enter } = setup(false);
    enter();
    expect(rooms).toEqual([]);
    expect(host.frame(0, [0, 0])).toBe(false); // nothing running: harmless
    host.leave();
  });

  it('greets a peer that joins with a Hello and its place, to that peer alone', () => {
    const { nets, host, enter } = setup();
    enter();
    nets[0]!.join('p');
    expect(nets[0]!.sent).toEqual([[encodeHello(), 'p']]); // no place known yet
    host.frame(10, [3, 1]);
    nets[0]!.sent.length = 0;
    nets[0]!.join('q');
    expect(nets[0]!.sent).toEqual([
      [encodeHello(), 'q'],
      [encodePos(3, 1, 0), 'q'],
    ]);
  });

  it('sends the hero position on change, 4 Hz at most, to every peer', () => {
    const { nets, host, enter } = setup();
    enter();
    host.frame(0, [0, 0]);
    host.frame(100, [1, 0]);
    host.frame(250, [1, 0]);
    host.frame(300, [2, 0]);
    host.frame(500, [2, 0]);
    expect(nets[0]!.sent.map(([d, to]) => [decode(d), to])).toEqual([
      [{ t: 'pos', q: 0, r: 0, seq: 0 }, undefined],
      [{ t: 'pos', q: 1, r: 0, seq: 1 }, undefined],
      [{ t: 'pos', q: 2, r: 0, seq: 2 }, undefined],
    ]);
  });

  it('shows a peer after its Hello and position, and reports the change once', () => {
    const { nets, host, root, enter } = setup();
    enter();
    nets[0]!.data(encodePos(1, 0, 0), 'p'); // no Hello: refused
    expect(host.frame(0, [0, 0])).toBe(false);
    nets[0]!.data(encodeHello(), 'p');
    nets[0]!.data(encodePos(1, 0, 0), 'p');
    expect(host.frame(1, [0, 0])).toBe(true);
    expect(root.dataset.peers).toBe('1');
    expect(host.frame(2, [0, 0])).toBe(false);
  });

  it('drops garbage bytes and a peer that left or went silent', () => {
    const { nets, host, root, clock, enter } = setup();
    enter();
    nets[0]!.data(Uint8Array.of(9, 9, 9), 'p');
    nets[0]!.data(encodeHello(), 'p');
    nets[0]!.data(encodePos(200, 0, 0), 'p');
    host.frame(1, [0, 0]);
    expect(root.dataset.edges).toBe('200');
    nets[0]!.leave('p');
    host.frame(2, [0, 0]);
    expect(root.dataset.peers).toBe('0');
    nets[0]!.data(encodeHello(), 'q');
    clock.now = 100;
    nets[0]!.data(encodePos(1, 0, 0), 'q');
    host.frame(200, [0, 0]);
    host.frame(100 + 10_001, [0, 0]);
    expect(root.dataset.peers).toBe('0');
  });

  it('leaves: closes the room, clears the screen, and stops sending', () => {
    const { nets, host, root, scene, enter } = setup();
    enter();
    nets[0]!.data(encodeHello(), 'p');
    nets[0]!.data(encodePos(200, 0, 0), 'p');
    host.frame(0, [0, 0]);
    host.leave();
    expect(nets[0]!.closed).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(scene.getObjectByName('peers')).toBeUndefined();
    nets[0]!.sent.length = 0;
    expect(host.frame(500, [5, 5])).toBe(false);
    expect(nets[0]!.sent).toEqual([]);
    host.leave(); // twice is harmless
  });

  it('entering another world leaves the first one', () => {
    const { nets, enter } = setup();
    enter();
    enter(7);
    expect(nets[0]!.closed).toBe(true);
    enter();
    expect(nets).toHaveLength(2);
  });

  it('reads the page clock when none is given', () => {
    const net = new FakeNet();
    const host = new WorldPeersHost(() => net, () => true, document.createElement('div'), () => {}, () => '', { keys: () => generateKeys(), canBreak: () => true, apply: () => {} });
    const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 1000);
    host.enter(PUBLIC_SEED, new THREE.Scene(), camera, { tile: () => undefined });
    net.data(encodeHello(), 'p');
    net.data(encodePos(1, 0, 0), 'p');
    expect(host.frame(performance.now(), [0, 0])).toBe(true);
  });

  it('sends the public name in its Hello, to a peer that joins and again when the name changes', () => {
    const { nets, host, me, enter } = setup();
    me.name = 'Ana';
    enter();
    nets[0]!.join('p');
    expect(decode(nets[0]!.sent[0]![0])).toEqual({ t: 'hello', name: 'Ana' });
    nets[0]!.sent.length = 0;
    me.name = 'Anna';
    host.setName();
    expect(nets[0]!.sent.map(([d, to]) => [decode(d), to])).toEqual([[{ t: 'hello', name: 'Anna' }, undefined]]);
    host.leave();
    nets[0]!.sent.length = 0;
    host.setName(); // no room: nothing to tell
    expect(nets[0]!.sent).toEqual([]);
  });

  it('shows the name of a peer on the screen', () => {
    const { nets, host, root, enter } = setup();
    enter();
    nets[0]!.data(encodeHello('Bob'), 'p');
    nets[0]!.data(encodePos(200, 0, 0), 'p');
    host.frame(0, [0, 0]);
    expect(root.querySelector('.peer-edge')!.textContent).toBe('Bob 200');
  });

  it('reports the status the player reads: nobody yet, a count, and nothing in a private world', () => {
    const { nets, host, reports, enter } = setup();
    enter(7);
    expect(reports.at(-1)).toEqual({ available: false, hidden: false, text: '' });
    enter();
    expect(reports.at(-1)).toEqual({ available: true, hidden: false, text: 'Online: nobody else here yet.' });
    nets[0]!.data(encodeHello(), 'p');
    nets[0]!.data(encodePos(1, 0, 0), 'p');
    host.frame(0, [0, 0]);
    expect(reports.at(-1)!.text).toBe('Online: 1 other hero here.');
    nets[0]!.data(encodeHello(), 'q');
    nets[0]!.data(encodePos(2, 0, 0), 'q');
    host.frame(200, [0, 0]);
    expect(reports.at(-1)!.text).toBe('Online: 2 other heroes here.');
    const count = reports.length;
    host.frame(400, [0, 0]);
    expect(reports).toHaveLength(count); // only a change is reported
    host.leave();
    expect(reports.at(-1)).toEqual({ available: false, hidden: false, text: '' });
  });

  it('shows a join error to the player, and clears it when a peer connects', () => {
    const { nets, host, reports, enter } = setup();
    enter();
    nets[0]!.fail('could not connect to peer p after exchanging SDP; configure TURN servers');
    expect(reports.at(-1)!.text).toBe('Online: a hero was found but the direct connection failed. Your network may block it.');
    nets[0]!.fail('handshake timed out');
    expect(reports.at(-1)!.text).toBe('Online: a connection problem, still trying.');
    nets[0]!.join('p');
    host.frame(0, [0, 0]);
    expect(reports.at(-1)!.text).toBe('Online: nobody else here yet.');
  });

  it('Hide leaves the room and the screen and Show joins again; leaving the world forgets both', () => {
    const { nets, host, reports, root, enter, rooms } = setup();
    enter();
    nets[0]!.data(encodeHello(), 'p');
    nets[0]!.data(encodePos(200, 0, 0), 'p');
    host.frame(0, [0, 0]);
    host.hide();
    expect(nets[0]!.closed).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(reports.at(-1)).toEqual({ available: true, hidden: true, text: 'Hidden: nobody sees you and you see nobody.' });
    expect(host.frame(10, [0, 0])).toBe(false);
    host.show();
    expect(rooms).toHaveLength(2);
    expect(reports.at(-1)!.hidden).toBe(false);
    host.show(); // already shown: no second room
    expect(rooms).toHaveLength(2);
    host.hide();
    host.hide(); // twice is harmless
    host.leave();
    host.show(); // the world was left: nothing to join
    expect(rooms).toHaveLength(2);
  });

  describe('the broken cells (#1305)', () => {
    const sentBreaks = (net: FakeNet) => net.sent.filter(([d]) => d[1] === 3);

    it('signs the cell the hero broke and sends it to every peer', async () => {
      const { nets, host, enter, keysOnce } = setup();
      enter();
      host.broke([4, -2]);
      await until(() => sentBreaks(nets[0]!).length === 1);
      const [bytes, to] = sentBreaks(nets[0]!)[0]!;
      expect(to).toBeUndefined();
      const message = decode(bytes!);
      expect(message).toMatchObject({ t: 'break', event: { seed: PUBLIC_SEED, q: 4, r: -2, pub: (await keysOnce).pub } });
    });

    it('says nothing when no room is open: private world, declined, hidden or left', async () => {
      const { nets, host, enter } = setup();
      host.broke([1, 1]); // nothing entered
      enter();
      host.hide();
      host.broke([1, 1]);
      await flush();
      host.show();
      host.leave();
      expect(sentBreaks(nets[0]!)).toEqual([]);
      expect(sentBreaks(nets[1]!)).toEqual([]);
    });

    it('a room left while the signature is made gets nothing', async () => {
      const { nets, host, enter } = setup();
      enter();
      host.broke([1, 1]);
      host.leave();
      await flush();
      expect(sentBreaks(nets[0]!)).toEqual([]);
    });

    it('applies a valid break from a peer once, and tells it to nobody else', async () => {
      const { nets, applied, enter, keysOnce } = setup();
      enter();
      const event = await signBreak(await keysOnce, PUBLIC_SEED, 3, 5);
      nets[0]!.data(encodeBreak(event), 'p');
      await until(() => applied.length === 1);
      expect(applied).toEqual([[3, 5]]);
      nets[0]!.data(encodeBreak(event), 'q'); // the same cell again, from another peer
      await flush();
      expect(applied).toEqual([[3, 5]]);
      expect(sentBreaks(nets[0]!)).toEqual([]);
    });

    it('refuses a break of another world, one the rules refuse, a forged signature and a flood', async () => {
      const { nets, applied, clock, enter, keysOnce } = setup();
      enter();
      const keys = await keysOnce;
      nets[0]!.data(encodeBreak(await signBreak(keys, 7, 3, 5)), 'p'); // another seed
      clock.now = 1000;
      nets[0]!.data(encodeBreak(await signBreak(keys, PUBLIC_SEED, -3, 5)), 'p'); // canBreak says no
      clock.now = 2000;
      const forged = await signBreak(keys, PUBLIC_SEED, 3, 6);
      nets[0]!.data(encodeBreak({ ...forged, q: 4 }), 'p'); // signed for another cell
      clock.now = 3000;
      await flush();
      expect(applied).toEqual([]);
      nets[0]!.data(encodeBreak(await signBreak(keys, PUBLIC_SEED, 8, 8)), 'p');
      nets[0]!.data(encodeBreak(await signBreak(keys, PUBLIC_SEED, 9, 9)), 'p'); // 0 ms after: dropped
      await until(() => applied.length === 1);
      await flush();
      expect(applied).toEqual([[8, 8]]);
    });

    it('a break that arrives after the room closed is dropped', async () => {
      const { nets, host, applied, enter, keysOnce } = setup();
      enter();
      nets[0]!.data(encodeBreak(await signBreak(await keysOnce, PUBLIC_SEED, 3, 5)), 'p');
      host.leave();
      await flush();
      expect(applied).toEqual([]);
    });

    it('gives a newcomer what it holds, newest first, one every 200 ms, and stops when it leaves', async () => {
      const { nets, host, clock, applied, enter, keysOnce } = setup();
      enter();
      const keys = await keysOnce;
      for (let q = 1; q <= 3; q++) {
        clock.now = q * 1000;
        nets[0]!.data(encodeBreak(await signBreak(keys, PUBLIC_SEED, q, 0)), `peer${q}`);
        await until(() => applied.length === q);
      }
      nets[0]!.join('new');
      nets[0]!.join('gone');
      nets[0]!.leave('gone');
      const qs = (): number[] => sentBreaks(nets[0]!).map(([d]) => (decode(d) as { event: { q: number } }).event.q);
      host.frame(1000, [0, 0]);
      expect(qs()).toEqual([3]);
      host.frame(1100, [0, 0]);
      expect(qs()).toEqual([3]); // too soon
      host.frame(1200, [0, 0]);
      host.frame(1400, [0, 0]);
      host.frame(1600, [0, 0]);
      expect(qs()).toEqual([3, 2, 1]);
      expect(sentBreaks(nets[0]!).every(([, to]) => to === 'new')).toBe(true);
    });

    it('holds its breaks through a Hide, and forgets them when the world is left', async () => {
      const { nets, host, enter } = setup();
      enter();
      host.broke([2, 2]);
      await until(() => sentBreaks(nets[0]!).length === 1);
      host.hide();
      host.show();
      nets[1]!.join('p');
      host.frame(0, [0, 0]);
      expect(sentBreaks(nets[1]!)).toHaveLength(1);
      host.leave();
      enter();
      nets[2]!.join('p');
      host.frame(0, [0, 0]);
      expect(sentBreaks(nets[2]!)).toEqual([]);
    });
  });

  describe('the armies (#1305)', () => {
    const troops = (net: FakeNet) => net.sent.filter(([d]) => d[1] === 4);

    it('sends the offsets of the hero troop when they change, 4 Hz at most, to every peer', () => {
      const { nets, host, enter } = setup();
      enter();
      host.frame(0, [0, 0], [[1, 0], [-1, 0]]);
      host.frame(100, [1, 0], [[2, 0], [0, 0]]); // the same offsets: nothing
      host.frame(300, [1, 0], [[2, 0]]);
      expect(troops(nets[0]!).map(([d, to]) => [decode(d), to])).toEqual([
        [{ t: 'troop', offsets: [[1, 0], [-1, 0]] }, undefined],
        [{ t: 'troop', offsets: [[1, 0]] }, undefined],
      ]);
    });

    it('gives a newcomer the troop with the hello and the place', () => {
      const { nets, host, enter } = setup();
      enter();
      host.frame(0, [0, 0], [[1, 0]]);
      nets[0]!.sent.length = 0;
      nets[0]!.join('p');
      expect(nets[0]!.sent.map(([d, to]) => [d[1], to])).toEqual([[1, 'p'], [2, 'p'], [4, 'p']]);
      nets[0]!.sent.length = 0;
      const fresh = setup();
      fresh.enter();
      fresh.nets[0]!.join('q'); // no place or troop known yet: the hello alone
      expect(fresh.nets[0]!.sent.map(([d]) => d[1])).toEqual([1]);
    });

    it('draws the troop a peer sends, and nothing for a troop before its hello', () => {
      const { nets, host, scene, enter } = setup();
      enter();
      const marbles = () => (scene.getObjectByName('peers') as THREE.InstancedMesh).count;
      nets[0]!.data(encodeTroop([[1, 0]]), 'p'); // no hello: refused
      nets[0]!.data(encodeHello(), 'p');
      nets[0]!.data(encodePos(1, 1, 0), 'p');
      nets[0]!.data(encodeTroop([[1, 0], [0, 1]]), 'p');
      host.frame(0, [0, 0]);
      expect(marbles()).toBe(3);
    });
  });
});

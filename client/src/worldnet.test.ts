// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { PeerNet } from './p2p';
import { decode, encodeHello, encodePos, PUBLIC_SEED, roomOf } from './worldpeers';
import { WorldPeersHost } from './worldnet';

class FakeNet implements PeerNet {
  sent: [Uint8Array, string | undefined][] = [];
  closed = false;
  data: (d: Uint8Array, peer: string) => void = () => {};
  join: (peer: string) => void = () => {};
  leave: (peer: string) => void = () => {};
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
  close(): void {
    this.closed = true;
  }
}

function setup(allowed = true) {
  const nets: FakeNet[] = [];
  const rooms: string[] = [];
  const clock = { now: 0 };
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
    () => clock.now,
  );
  const enter = (seed = PUBLIC_SEED) => host.enter(seed, scene, camera, world as never);
  return { host, nets, rooms, clock, root, scene, enter };
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
    const host = new WorldPeersHost(() => net, () => true, document.createElement('div'));
    const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 1000);
    host.enter(PUBLIC_SEED, new THREE.Scene(), camera, { tile: () => undefined });
    net.data(encodeHello(), 'p');
    net.data(encodePos(1, 0, 0), 'p');
    expect(host.frame(performance.now(), [0, 0])).toBe(true);
  });
});

// The public Open world online (#1305): the hero's room, what it sends and what it shows of the other heroes. The Open world mode
// calls it on entering and leaving a world and on each frame; it stays idle on any seed but the public one, and until the player
// accepted online play (main.ts asks first, consent.ts). Nothing goes through a relay but the connection itself (p2p.ts).
import type * as THREE from 'three/webgpu';
import type { Axial } from './board';
import type { World } from './openworld';
import type { PeerNet } from './p2p';
import { decode, encodeHello, Peers, PUBLIC_SEED, roomOf, Sender } from './worldpeers';
import { PeersLayer } from './worldpeersview';

/** What the Open world mode needs of the online layer. */
export interface PeerHost {
  /** A world was entered: joins the room when it is the public one. */
  enter(seed: number, scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: Pick<World, 'tile'>): void;
  /** Called every frame at `now` (ms) with the hero's cell. Returns whether the scene must be drawn again. */
  frame(now: number, hero: Axial): boolean;
  /** The world was left: stops sending and clears the screen. */
  leave(): void;
}

interface Running {
  net: PeerNet;
  sender: Sender;
  peers: Peers;
  layer: PeersLayer;
}

export class WorldPeersHost implements PeerHost {
  private running: Running | null = null;

  /**
   * `open` joins a room, `allowed` says whether online play was accepted (read when a world is entered), `root` holds the edge
   * indicators, `clock` is the time in ms (the frame's time base).
   */
  constructor(
    private readonly open: (room: string) => PeerNet,
    private readonly allowed: () => boolean,
    private readonly root: HTMLElement,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  enter(seed: number, scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: Pick<World, 'tile'>): void {
    this.leave();
    if (seed !== PUBLIC_SEED || !this.allowed()) return;
    const net = this.open(roomOf(seed));
    const sender = new Sender();
    const peers = new Peers();
    net.onJoin((peer) => {
      net.send(encodeHello(), peer);
      const here = sender.now();
      if (here) net.send(here, peer);
    });
    net.onData((data, peer) => {
      const message = decode(data);
      if (message?.t === 'hello') peers.hello(peer, this.clock());
      else if (message) peers.position(peer, message, this.clock());
    });
    net.onLeave((peer) => peers.leave(peer));
    this.running = { net, sender, peers, layer: new PeersLayer(scene, camera, world, this.root) };
  }

  frame(now: number, hero: Axial): boolean {
    const run = this.running;
    if (!run) return false;
    run.sender.set(hero[0], hero[1]);
    const message = run.sender.due(now);
    if (message) run.net.send(message);
    run.peers.expire(now);
    return run.layer.update(run.peers.cells(hero), hero);
  }

  leave(): void {
    const run = this.running;
    if (!run) return;
    this.running = null;
    run.net.close();
    run.layer.dispose();
  }
}

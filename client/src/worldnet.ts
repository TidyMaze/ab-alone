// The public Open world online (#1305): the hero's room, what it sends and what it shows of the other heroes. The Open world mode
// calls it on entering and leaving a world and on each frame; it stays idle on any seed but the public one, and until the player
// accepted online play (main.ts asks first, consent.ts). Nothing goes through a relay but the connection itself (p2p.ts).
import type * as THREE from 'three/webgpu';
import type { Axial } from './board';
import type { World } from './openworld';
import type { PeerNet } from './p2p';
import { joinErrorCause } from './netcounters';
import type { Keys } from './moverecord';
import { BreakSet, SYNC_MAX, SYNC_MS, signBreak, verifyBreak } from './worldevents';
import { type BreakEvent, decode, encodeBreak, encodeHello, Peers, PUBLIC_SEED, roomOf, Sender } from './worldpeers';
import { PeersLayer } from './worldpeersview';

/** What the Open world mode needs of the online layer. */
export interface PeerHost {
  /** A world was entered: joins the room when it is the public one. */
  enter(seed: number, scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: Pick<World, 'tile'>): void;
  /** Called every frame at `now` (ms) with the hero's cell and its troop's cells. Returns whether the scene must be drawn again. */
  frame(now: number, hero: Axial, troop?: readonly Axial[]): boolean;
  /** The world was left: stops sending and clears the screen. */
  leave(): void;
  /** The hero broke the obstacle on `cell`: told to the others, signed. */
  broke(cell: Axial): void;
}

/** What the signed break events need of the page: the player's key, the rule of the world (`world_can_break`) and what happens to a
 * cell another hero broke (the world opens it and the view smashes its prop). */
export interface BreakHooks {
  keys: () => Promise<Keys>;
  canBreak: (seed: number, q: number, r: number) => boolean;
  apply: (cell: Axial) => void;
}

/** Breaks from one peer closer together than this are dropped (flood guard; the sync of a newcomer goes at SYNC_MS). */
const BREAK_GAP_MS = 100;

/** What the HUD shows of the connection: `available` is false outside the public world (no controls), `hidden` when the player hides. */
export interface NetStatus {
  available: boolean;
  hidden: boolean;
  text: string;
}

const NOBODY = 'Online: nobody else here yet.';
const heroes = (n: number): string => `Online: ${n} other ${n === 1 ? 'hero' : 'heroes'} here.`;
const ERRORS: Record<string, string> = {
  'ice-failed': 'Online: a hero was found but the direct connection failed. Your network may block it.',
  'join-error': 'Online: a connection problem, still trying.',
};

interface Running {
  net: PeerNet;
  sender: Sender;
  peers: Peers;
  layer: PeersLayer;
}

export class WorldPeersHost implements PeerHost {
  private running: Running | null = null;
  /** The public world entered, kept while the player hides, so Show can join again. */
  private entered: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; world: Pick<World, 'tile'> } | null = null;
  private text = '';
  private lastCount = 0;
  private failed = '';
  /** The cells broken this visit, what is owed to peers that joined (a queue each), and when a peer last sent a break. */
  private readonly held = new BreakSet();
  private syncing: { peer: string; events: BreakEvent[] }[] = [];
  private lastSync = -Infinity;
  private readonly lastBreak = new Map<string, number>();

  /**
   * `open` joins a room, `allowed` says whether online play was accepted (read when a world is entered), `root` holds the edge
   * indicators and name tags, `report` gets the status the HUD shows, `name` the player's public name, `clock` the time in ms
   * (the frame's time base), `hooks` the signed break events.
   */
  constructor(
    private readonly open: (room: string) => PeerNet,
    private readonly allowed: () => boolean,
    private readonly root: HTMLElement,
    private readonly report: (status: NetStatus) => void,
    private readonly name: () => string,
    private readonly hooks: BreakHooks,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  enter(seed: number, scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: Pick<World, 'tile'>): void {
    this.leave();
    if (seed !== PUBLIC_SEED || !this.allowed()) return void this.say({ available: false, hidden: false, text: '' });
    this.entered = { scene, camera, world };
    this.start();
  }

  private say(status: NetStatus): void {
    this.text = status.text;
    this.report(status);
  }

  /** Reports the status of the room as it is now. */
  private update(): void {
    const text = this.failed || (this.lastCount > 0 ? heroes(this.lastCount) : NOBODY);
    if (text !== this.text) this.say({ available: true, hidden: false, text });
  }

  private start(): void {
    const { scene, camera, world } = this.entered!;
    const net = this.open(roomOf(PUBLIC_SEED));
    const sender = new Sender();
    const peers = new Peers();
    net.onJoin((peer) => {
      this.failed = '';
      net.send(encodeHello(this.name()), peer);
      const here = sender.now();
      if (here) net.send(here, peer);
      const troop = sender.nowTroop();
      if (troop) net.send(troop, peer);
      const events = this.held.newest(SYNC_MAX);
      if (events.length > 0) this.syncing.push({ peer, events });
    });
    net.onData((data, peer) => {
      const message = decode(data);
      if (message?.t === 'hello') peers.hello(peer, this.clock(), message.name);
      else if (message?.t === 'break') void this.receive(peer, message.event);
      else if (message?.t === 'troop') peers.troop(peer, message.offsets, this.clock());
      else if (message) peers.position(peer, message, this.clock());
    });
    net.onLeave((peer) => {
      peers.leave(peer);
      this.lastBreak.delete(peer);
      this.syncing = this.syncing.filter((s) => s.peer !== peer);
    });
    net.onError((message) => {
      this.failed = ERRORS[joinErrorCause(message)]!;
      this.update();
    });
    this.running = { net, sender, peers, layer: new PeersLayer(scene, camera, world, this.root) };
    this.lastCount = 0;
    this.failed = '';
    this.text = '';
    this.update();
  }

  /** The hero broke the obstacle on `cell`: signs it, holds it and tells every peer. */
  broke(cell: Axial): void {
    void this.announce(cell);
  }

  private async announce([q, r]: Axial): Promise<void> {
    const run = this.running;
    if (!run) return;
    const event = await signBreak(await this.hooks.keys(), PUBLIC_SEED, q, r);
    if (this.running !== run) return; // the room closed while the key signed
    this.held.add(event);
    run.net.send(encodeBreak(event));
  }

  /** A break from `peer`: checked (this world, a cell that can break, not too fast, a signature that verifies), then held and applied. */
  private async receive(peer: string, event: BreakEvent): Promise<void> {
    const run = this.running;
    if (event.seed !== PUBLIC_SEED || this.held.has(event.q, event.r)) return;
    const now = this.clock();
    if (now - (this.lastBreak.get(peer) ?? -Infinity) < BREAK_GAP_MS) return;
    this.lastBreak.set(peer, now);
    if (!this.hooks.canBreak(event.seed, event.q, event.r) || !(await verifyBreak(event))) return;
    if (this.running !== run || !this.held.add(event)) return; // the room closed meanwhile, or the same cell came first
    this.hooks.apply([event.q, event.r]);
  }

  /** The public name changed: tells the peers here. */
  setName(): void {
    this.running?.net.send(encodeHello(this.name()));
  }

  frame(now: number, hero: Axial, troop: readonly Axial[] = []): boolean {
    const run = this.running;
    if (!run) return false;
    run.sender.set(hero[0], hero[1]);
    run.sender.setTroop(troop);
    const message = run.sender.due(now);
    if (message) run.net.send(message);
    const army = run.sender.dueTroop(now);
    if (army) run.net.send(army);
    run.peers.expire(now);
    const owed = this.syncing[0];
    if (owed && now - this.lastSync >= SYNC_MS) {
      this.lastSync = now;
      run.net.send(encodeBreak(owed.events.shift()!), owed.peer);
      if (owed.events.length === 0) this.syncing.shift();
    }
    const cells = run.peers.cells(hero);
    this.lastCount = cells.length;
    this.update();
    return run.layer.update(cells, hero, [hero, ...troop]);
  }

  /** Stops sending and receiving: peers drop this hero after 10 s, and it sees nobody. */
  hide(): void {
    if (!this.running) return;
    this.stop();
    this.say({ available: true, hidden: true, text: 'Hidden: nobody sees you and you see nobody.' });
  }

  /** Joins the room again after a Hide. */
  show(): void {
    if (!this.entered || this.running) return;
    this.start();
  }

  private stop(): void {
    const run = this.running;
    if (!run) return;
    this.running = null;
    this.syncing = [];
    this.lastBreak.clear();
    run.net.close();
    run.layer.dispose();
  }

  leave(): void {
    const wasHere = this.entered !== null;
    this.stop();
    this.entered = null;
    this.held.clear();
    if (wasHere) this.say({ available: false, hidden: false, text: '' });
  }
}

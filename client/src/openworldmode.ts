// The Open world mode (docs/specs/openworld.md): the world of a seed, the hero in it, and the view that draws them, as one
// thing main.ts switches on and off. It draws itself with the page's renderer while it is on, and the page's board stays
// untouched.
import type * as THREE from 'three/webgpu';
import type { Axial } from './board';
import { arrowCell } from './hubview';
import { chunkOf, Hero, World } from './openworld';
import { FightState, readPush } from './openworldfight';
import type { WorldSave, WorldSaves } from './openworldsave';
import { MAX_REACH, OpenWorldView, type Played, type PropModels } from './openworldview';

/** The push of a step, the bridge's `world_push` (docs/specs/openworld.md section 4): the seed, the hero's cell then the troop's,
 * the enemies near the hero, all `q, r` pairs; its answer is empty when no push is legal (`readPush`). */
export type TroopPush = (seed: number, troop: Int32Array, enemies: Int32Array) => Int32Array;

/** The enemies within this many cells of the hero are the ones a push can reach. */
export const PUSH_REACH = 10;

/** The slow factor of the pushes' animation: a webdriver check sets `window.__openworldSlow` to see a push in the middle of it. */
const slowBy = (): number => Number((window as { __openworldSlow?: number }).__openworldSlow ?? 1);

/** The cells as the bridge takes them: `q, r` pairs. */
const flat = (cells: readonly Axial[]): Int32Array => Int32Array.from(cells.flat());

/** The diagonal cell of each vertical arrow and horizontal arrow held together, in the axial steps of `neighbours`: up is
 * -z on screen (the camera looks down the -z way), so these are the four diagonals of the hex grid. */
const DIAGONAL: Record<string, Record<string, Axial>> = {
  ArrowUp: { ArrowLeft: [0, -1], ArrowRight: [1, -1] },
  ArrowDown: { ArrowLeft: [-1, 1], ArrowRight: [0, 1] },
};

/** The cell a diagonal of two held arrows rolls to: one vertical and one horizontal arrow, both held; `null` otherwise. */
export function heldCell([q, r]: Axial, held: ReadonlySet<string>): Axial | null {
  const vertical = ['ArrowUp', 'ArrowDown'].filter((k) => held.has(k));
  const horizontal = ['ArrowLeft', 'ArrowRight'].filter((k) => held.has(k));
  if (vertical.length !== 1 || horizontal.length !== 1) return null;
  const [dq, dr] = DIAGONAL[vertical[0]!]![horizontal[0]!]!;
  return [q + dq, r + dr];
}

/** Whether two opposite arrows are held together: they cancel, so the hero stays put. */
const opposed = (held: ReadonlySet<string>): boolean =>
  (held.has('ArrowUp') && held.has('ArrowDown')) || (held.has('ArrowLeft') && held.has('ArrowRight'));

export class OpenWorldMode {
  active = false;
  hero: Hero | null = null;
  private view: OpenWorldView | null = null;
  private world: World | null = null;
  /** The seed of the world entered, the enemies as the pushes left them, and the pushes played so far. */
  private seed = 0;
  private fight = new FightState();
  private pushes = 0;
  private dirty = false;
  /** Whether the world changed since its last save, and how many saves the page has stored (`openworldSaved`, #968). */
  private unsaved = false;
  private writes = 0;
  /** The time of the last frame, in ms: the camera's ease runs on the time between frames. */
  private clock = 0;
  /** The arrow keys held down: a vertical and a horizontal one together roll a diagonal. */
  private readonly held = new Set<string>();
  /** The props are read once for the page: every entry reuses them. */
  private modelsOnce?: Promise<PropModels>;

  /** `load` reads a chunk of a seed's world, `models` the low-poly and the detailed props: the first draw does not wait for them.
   * `reduced` tells whether the page asks for reduced motion, which holds the water still. `push` plays the troop's push. */
  constructor(
    private readonly load: (seed: number, cx: number, cy: number) => Uint8Array,
    private readonly loadEnemies: (seed: number, cx: number, cy: number) => Int32Array,
    private readonly models: () => Promise<PropModels>,
    private readonly reduced: () => boolean,
    private readonly push: TroopPush,
    private readonly saves: WorldSaves,
  ) {}

  /** Opens the world of `seed`: its saved state when `resume` (the default) and a save of this version is there, else the spawn.
   * The save is read before the first draw, and the seed is remembered as the last world played (#968). */
  async open(seed: number, width: number, height: number, resume = true): Promise<void> {
    const saved = resume ? await this.saves.load(seed) : null;
    this.enter(seed, width, height, saved);
    void this.saves.remember(seed);
  }

  /** Enters the world of `seed` with the hero, the troop and the fight of `saved` (a save of this seed), or on the spawn. */
  enter(seed: number, width: number, height: number, saved: WorldSave | null = null): void {
    this.flush(); // the world left (another seed entered over it) is saved first
    this.view?.dispose();
    this.seed = seed;
    const world = new World(
      (cx, cy) => this.load(seed, cx, cy),
      (cx, cy) => this.loadEnemies(seed, cx, cy),
    );
    this.world = world;
    this.fight = saved ? FightState.fromJSON(saved.fight) : new FightState();
    this.pushes = 0;
    const view = new OpenWorldView(world, this.fight);
    this.hero = new Hero(world, this.fight);
    if (saved) {
      this.hero.at = saved.hero;
      this.hero.troop = saved.troop;
    }
    this.view = view;
    view.resize(width, height);
    view.show(this.hero.at, this.hero.troop);
    this.active = true;
    this.dirty = true;
    this.mark(String(seed));
    this.modelsOnce ??= this.models();
    void this.modelsOnce.then((models) => {
      if (this.view !== view) return; // left before the models arrived
      view.useModels(models);
      this.dirty = true;
      this.mark(String(seed)); // the detailed props drawn now are published too (#989)
    });
  }

  leave(): void {
    this.flush();
    this.active = false;
    this.held.clear();
    this.view?.dispose();
    this.view = null;
    this.world = null;
    this.dirty = false;
    delete document.body.dataset.openworld;
    delete document.body.dataset.openworldAt;
    delete document.body.dataset.openworldTroop;
    delete document.body.dataset.openworldEnemies;
    delete document.body.dataset.openworldBeaten;
    delete document.body.dataset.openworldPush;
    delete document.body.dataset.openworldZoom;
    delete document.body.dataset.openworldDrawn;
    delete document.body.dataset.openworldAnim;
  }

  /** The New world control (#1021): the world entered is left without its save, which is discarded, and a random world is entered
   * on the spawn in its place. Returns its seed, which the page shows and the URL takes. */
  async newWorld(width: number, height: number): Promise<number> {
    const left = this.seed;
    this.unsaved = false; // the world left is discarded, not saved again
    await this.saves.discard(left);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    await this.open(seed, width, height, false);
    return seed;
  }

  /** The enemy marbles near the hero now, the pushed ones where they stand (the browser checks read them). */
  enemies(): Axial[] {
    return this.fight.enemiesAround(this.world!, this.hero!.at, PUSH_REACH);
  }

  /** A test fixture (webdriver pages only, docs/specs/openworld.md section 6): the hero on `hero`, the troop on `troop`, and the
   * enemies of the loaded square replaced by `enemies`, none pushed. */
  fixture({ hero, troop, enemies }: { hero: Axial; troop: Axial[]; enemies: Axial[] }): void {
    this.view!.snap();
    const [cx, cy] = chunkOf(hero);
    this.fight.reset();
    this.fight.hide(this.world!, cx, cy, MAX_REACH);
    this.fight.apply([], enemies, []);
    this.hero!.at = hero;
    this.hero!.troop = troop;
    this.view!.show(hero, troop);
    this.view!.updateEnemies();
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  /** A new window size: the view follows it, and the zoom it may have been clamped to is published (#976). */
  resize(width: number, height: number): void {
    this.view?.snap();
    this.view?.resize(width, height);
    this.dirty = true;
    if (this.active) this.mark(document.body.dataset.openworld!);
  }

  /** An arrow key rolls the hero one cell, or on the diagonal while a vertical and a horizontal arrow are both held;
   * opposite arrows held together do nothing. Escape leaves. Reports whether the key was the mode's. */
  key(key: string): boolean {
    if (key === 'Escape') return this.leave(), true;
    const single = arrowCell(this.hero!.at, key);
    if (!single) return false;
    this.held.add(key);
    const to = heldCell(this.hero!.at, this.held) ?? (opposed(this.held) ? null : single);
    if (to) this.roll(to);
    return true;
  }

  /** An arrow key let go; no argument (the window lost focus) lets go of all of them. */
  release(key?: string): void {
    if (key === undefined) this.held.clear();
    else this.held.delete(key);
  }

  /** A press at `x`, `y` pixels of a `width` x `height` screen rolls the hero onto the cell under it when it is next to it. */
  press(x: number, y: number, width: number, height: number): void {
    this.roll(this.view!.pick((x / width) * 2 - 1, 1 - (y / height) * 2));
  }

  /** Zooms the Open world camera by `scale`: more than 1 further out, less than 1 closer (#976). */
  zoom(scale: number): void {
    this.view!.snap();
    this.view!.zoomBy(scale);
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  /** Eases the camera toward the hero's column top, then draws the scene when something changed since the last draw (the ease
   * included, until it settles), and every frame while a lake is in view and motion is on. `now` is the frame time in ms. */
  frame(render: (scene: THREE.Scene, camera: THREE.Camera) => void, now = performance.now()): void {
    if (!this.view) return; // left: nothing to draw
    this.flush(); // at most one save a frame, of the state the frame ends on (#968)
    const seconds = (now - this.clock) / 1000;
    this.clock = now;
    const reduced = this.reduced();
    if (this.view!.ease(seconds, reduced)) this.dirty = true;
    if (this.view!.tick(now)) this.dirty = true; // the marbles of a push in between their cells, drawn every frame (#967)
    this.anim();
    const moving = !reduced && this.view!.hasWater;
    if (!this.dirty && !moving) return;
    this.dirty = false;
    this.view!.glow(moving ? now : 0);
    render(this.view!.scene, this.view!.camera);
    this.view!.drain(); // what this frame replaced is no longer in use by it (#1017)
  }

  private roll(to: Axial): void {
    if (!this.hero!.step(to)) return;
    this.view!.snap(); // a step during a push's animation ends it first (#967)
    const played = this.troopPush();
    this.view!.show(this.hero!.at, this.hero!.troop);
    this.view!.updateEnemies();
    if (played && !this.reduced()) this.view!.playPush(played, performance.now(), slowBy()); // reduced motion: the marbles jump
    this.dirty = true;
    this.persist();
    this.mark(document.body.dataset.openworld!);
  }

  /** The troop's attack after a step: the bridge plays the legal push, if there is one, on the hero, the troop and the enemies near
   * the hero. The hero and the troop take the cells it gives (the hero's first), the enemies are kept in the fight. Returns the push
   * as it was played, from the cells before it, for its animation; `null` when no push was legal. */
  private troopPush(): Played | null {
    const enemies = this.enemies();
    const from = [this.hero!.at, ...this.hero!.troop];
    const pushed = readPush(this.push(this.seed, flat(from), flat(enemies)));
    if (!pushed) return null;
    this.fight.apply(enemies, pushed.enemies, pushed.ejected);
    const [hero, ...troop] = pushed.troop;
    this.hero!.at = hero!;
    this.hero!.troop = troop;
    this.pushes++;
    return { from, foes: enemies, push: pushed };
  }

  /** Marks the world as changed: it is saved by the next frame, or when the mode is left. */
  private persist(): void {
    this.unsaved = true;
  }

  /** Saves the world as it is now, when it changed since the last save. The write is not waited for: a storage that fails is no
   * game error, and the save is counted (`openworldSaved`) only once it is stored. */
  private flush(): void {
    if (!this.unsaved) return;
    this.unsaved = false;
    const { at, troop } = this.hero!;
    void this.saves.put(this.seed, at, troop, this.fight).then((stored) => {
      if (stored) document.body.dataset.openworldSaved = String(++this.writes);
    });
  }

  /** The mark of a push being drawn (`openworldAnim`, for the browser checks): set while the view draws it, removed otherwise. */
  private anim(): void {
    if (this.view?.animating) document.body.dataset.openworldAnim = '1';
    else delete document.body.dataset.openworldAnim;
  }

  private mark(seed: string): void {
    this.anim();
    document.body.dataset.openworld = seed;
    const shown = document.getElementById('openworld-seed'); // the HUD's seed, to read or share (#1021)
    if (shown) shown.textContent = seed;
    document.body.dataset.openworldAt = this.hero!.at.join(',');
    document.body.dataset.openworldTroop = this.hero!.troop.map((c) => c.join(',')).join(' ');
    document.body.dataset.openworldEnemies = String(this.view!.enemyCount);
    document.body.dataset.openworldBeaten = String(this.fight.beaten);
    document.body.dataset.openworldPush = String(this.pushes);
    document.body.dataset.openworldZoom = String(this.view!.zoom);
    document.body.dataset.openworldDrawn = JSON.stringify(this.view!.drawn);
  }
}

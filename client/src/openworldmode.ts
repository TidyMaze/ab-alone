// The Open world mode (docs/specs/openworld.md): the world of a seed, the hero in it, and the view that draws them, as one
// thing main.ts switches on and off. It draws itself with the page's renderer while it is on, and the page's board stays
// untouched.
import type * as THREE from 'three/webgpu';
import type { Axial } from './board';
import { arrowCell } from './hubview';
import { Hero, World } from './openworld';
import { OpenWorldView, type PropModels } from './openworldview';

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
  private dirty = false;
  /** The time of the last frame, in ms: the camera's ease runs on the time between frames. */
  private clock = 0;
  /** The arrow keys held down: a vertical and a horizontal one together roll a diagonal. */
  private readonly held = new Set<string>();
  /** The props are read once for the page: every entry reuses them. */
  private modelsOnce?: Promise<PropModels>;

  /** `load` reads a chunk of a seed's world, `models` the low-poly and the detailed props: the first draw does not wait for them.
   * `reduced` tells whether the page asks for reduced motion, which holds the water still. */
  constructor(
    private readonly load: (seed: number, cx: number, cy: number) => Uint8Array,
    private readonly loadEnemies: (seed: number, cx: number, cy: number) => Int32Array,
    private readonly models: () => Promise<PropModels>,
    private readonly reduced: () => boolean,
  ) {}

  enter(seed: number, width: number, height: number): void {
    this.view?.dispose();
    const world = new World(
      (cx, cy) => this.load(seed, cx, cy),
      (cx, cy) => this.loadEnemies(seed, cx, cy),
    );
    const view = new OpenWorldView(world);
    this.hero = new Hero(world);
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
    this.active = false;
    this.held.clear();
    this.view?.dispose();
    this.view = null;
    this.dirty = false;
    delete document.body.dataset.openworld;
    delete document.body.dataset.openworldAt;
    delete document.body.dataset.openworldTroop;
    delete document.body.dataset.openworldEnemies;
    delete document.body.dataset.openworldZoom;
    delete document.body.dataset.openworldDrawn;
  }

  /** A new window size: the view follows it, and the zoom it may have been clamped to is published (#976). */
  resize(width: number, height: number): void {
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
    this.view!.zoomBy(scale);
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  /** Eases the camera toward the hero's column top, then draws the scene when something changed since the last draw (the ease
   * included, until it settles), and every frame while a lake is in view and motion is on. `now` is the frame time in ms. */
  frame(render: (scene: THREE.Scene, camera: THREE.Camera) => void, now = performance.now()): void {
    if (!this.view) return; // left: nothing to draw
    const seconds = (now - this.clock) / 1000;
    this.clock = now;
    const reduced = this.reduced();
    if (this.view!.ease(seconds, reduced)) this.dirty = true;
    const moving = !reduced && this.view!.hasWater;
    if (!this.dirty && !moving) return;
    this.dirty = false;
    this.view!.glow(moving ? now : 0);
    render(this.view!.scene, this.view!.camera);
    this.view!.drain(); // what this frame replaced is no longer in use by it (#1017)
  }

  private roll(to: Axial): void {
    if (!this.hero!.step(to)) return;
    this.view!.show(this.hero!.at, this.hero!.troop);
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  private mark(seed: string): void {
    document.body.dataset.openworld = seed;
    document.body.dataset.openworldAt = this.hero!.at.join(',');
    document.body.dataset.openworldTroop = this.hero!.troop.map((c) => c.join(',')).join(' ');
    document.body.dataset.openworldEnemies = String(this.view!.enemyCount);
    document.body.dataset.openworldZoom = String(this.view!.zoom);
    document.body.dataset.openworldDrawn = JSON.stringify(this.view!.drawn);
  }
}

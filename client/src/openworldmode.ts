// The Open world mode (docs/specs/openworld.md): the world of a seed, the hero in it, and the view that draws them, as one
// thing main.ts switches on and off. It draws itself with the page's renderer while it is on, and the page's board stays
// untouched.
import type * as THREE from 'three/webgpu';
import type { Axial } from './board';
import { arrowCell } from './hubview';
import { Hero, World } from './openworld';
import { OpenWorldView, type PropGeometries } from './openworldview';

export class OpenWorldMode {
  active = false;
  hero: Hero | null = null;
  private view: OpenWorldView | null = null;
  private dirty = false;

  /** `load` reads a chunk of a seed's world, `models` the low-poly props: the first draw does not wait for them. */
  constructor(
    private readonly load: (seed: number, cx: number, cy: number) => Uint8Array,
    private readonly models: () => Promise<PropGeometries>,
  ) {}

  enter(seed: number, width: number, height: number): void {
    const world = new World((cx, cy) => this.load(seed, cx, cy));
    const view = new OpenWorldView(world);
    this.hero = new Hero(world);
    this.view = view;
    view.resize(width, height);
    view.show(this.hero.at);
    this.active = true;
    this.dirty = true;
    this.mark(String(seed));
    void this.models().then((geometries) => {
      view.useModels(geometries);
      this.dirty = true;
    });
  }

  leave(): void {
    this.active = false;
    delete document.body.dataset.openworld;
    delete document.body.dataset.openworldAt;
  }

  resize(width: number, height: number): void {
    this.view?.resize(width, height);
    this.dirty = true;
  }

  /** An arrow key rolls the hero one cell; Escape leaves. Reports whether the key was the mode's. */
  key(key: string): boolean {
    if (key === 'Escape') return this.leave(), true;
    const to = arrowCell(this.hero!.at, key);
    if (!to) return false;
    this.roll(to);
    return true;
  }

  /** A press at `x`, `y` pixels of a `width` x `height` screen rolls the hero onto the cell under it when it is next to it. */
  press(x: number, y: number, width: number, height: number): void {
    this.roll(this.view!.pick((x / width) * 2 - 1, 1 - (y / height) * 2));
  }

  /** Draws the scene when something changed since the last draw. */
  frame(render: (scene: THREE.Scene, camera: THREE.Camera) => void): void {
    if (!this.dirty) return;
    this.dirty = false;
    render(this.view!.scene, this.view!.camera);
  }

  private roll(to: Axial): void {
    if (!this.hero!.step(to)) return;
    this.view!.show(this.hero!.at);
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  private mark(seed: string): void {
    document.body.dataset.openworld = seed;
    document.body.dataset.openworldAt = this.hero!.at.join(',');
  }
}

// The map of the Open world (#1411, docs/specs/openworld.md section 9): the cells discovered so far, full screen over the world, drawn by
// the minimap's drawing (`drawMap`) on a canvas of the window's size. A drag pans it, the wheel and a pinch zoom it; the mode opens and
// closes it, and hands it the data. A click on a cell goes to `pick`, for what a click on the map will do (the teleporters of #1412).
import type { Axial } from './board';
import { pinchScale, wheelScale } from './camera';
import { cellAtPoint } from './openworld';
import { drawMap, groundOffset, type MinimapData } from './openworldminimap';

/** The px a cell takes when the map opens, and the bounds of its zoom: the widest view keeps the cells to draw in the hundred thousands. */
export const UNIT = 8;
export const MIN_UNIT = 3;
export const MAX_UNIT = 32;
/** A press that moves less than this many px is a click on a cell, not a drag. */
const CLICK_PX = 6;

/** The data of the map: the cells of the hex disc of `radius` round `centre`, with the hero, the troop, the enemies and the lairs. */
export type MapSource = (centre: Axial, radius: number) => MinimapData;

export class WorldMap {
  /** The box over the screen that takes the pointer. Its canvas ignores the pointer, so the touch stick (which takes a press on a canvas)
   * leaves the map alone. */
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  /** The cell in the middle of the map, fractions allowed, the px a cell takes, and the camera's yaw the map was last drawn in. */
  private centre: Axial = [0, 0];
  private unit = UNIT;
  private yaw = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  /** How far the press under way has moved, in px: past CLICK_PX it is no click. */
  private travel = 0;
  /** A click on a cell of the map: nothing yet. */
  pick: (cell: Axial) => void = () => {};

  constructor(private readonly source: MapSource) {
    this.root.id = 'openworld-map';
    this.root.setAttribute('role', 'img');
    this.root.setAttribute('aria-label', 'Map of the Open world');
    this.root.append(this.canvas);
    this.root.addEventListener('pointerdown', (e) => this.down(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    this.root.addEventListener('pointerup', (e) => this.up(e));
    this.root.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    this.root.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(wheelScale(e.deltaY));
      },
      { passive: false },
    );
  }

  get shown(): boolean {
    return this.root.isConnected;
  }

  /** Opens the map over the page, on `hero`, at the default zoom, on a `width` x `height` px canvas. */
  open(hero: Axial, width: number, height: number): void {
    this.centre = [...hero];
    this.unit = UNIT;
    document.body.append(this.root);
    this.resize(width, height);
  }

  close(): void {
    this.root.remove();
    this.pointers.clear();
  }

  /** A new window size. */
  resize(width: number, height: number): void {
    Object.assign(this.canvas, { width, height });
    this.draw();
  }

  /** Moves the map as a drag of `dx`, `dy` px does: the ground follows the pointer. */
  pan(dx: number, dy: number): void {
    const [dq, dr] = groundOffset(dx / this.unit, dy / this.unit, this.yaw);
    this.centre = [this.centre[0] - dq, this.centre[1] - dr];
    this.draw();
  }

  /** Zooms by `scale`: more than 1 further out, less than 1 closer, as the camera's zoom. */
  zoom(scale: number): void {
    this.unit = Math.min(MAX_UNIT, Math.max(MIN_UNIT, this.unit / scale));
    this.draw();
  }

  /** Draws the map, when it is shown, from the data of the cells it covers. */
  draw(): void {
    const ctx = this.shown ? this.canvas.getContext('2d') : null;
    if (!ctx) return;
    const { width, height } = this.canvas;
    const radius = Math.ceil(Math.hypot(width, height) / 2 / this.unit / (Math.sqrt(3) / 2)) + 2; // the disc that holds the corners
    const data = this.source([Math.round(this.centre[0]) + 0, Math.round(this.centre[1]) + 0], radius);
    this.yaw = data.yaw;
    drawMap(ctx, { width, height, centre: this.centre, unit: this.unit, round: false }, data);
  }

  /** The cell under the point `x`, `y` of the window. */
  private cellAt(x: number, y: number): Axial {
    const [dq, dr] = groundOffset((x - this.canvas.width / 2) / this.unit, (y - this.canvas.height / 2) / this.unit, this.yaw);
    const [q, r] = [this.centre[0] + dq, this.centre[1] + dr];
    return cellAtPoint(q + r / 2, (Math.sqrt(3) / 2) * r);
  }

  private down(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.travel = this.pointers.size === 1 ? 0 : Infinity; // a second finger makes it a pinch
  }

  private move(e: PointerEvent): void {
    const last = this.pointers.get(e.pointerId);
    if (!last) return;
    const span = (): number => {
      const [a, b] = [...this.pointers.values()];
      return Math.hypot(a!.x - b!.x, a!.y - b!.y);
    };
    const before = this.pointers.size === 2 ? span() : 0;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) return this.zoom(pinchScale(before, span()));
    this.travel += Math.hypot(e.clientX - last.x, e.clientY - last.y);
    this.pan(e.clientX - last.x, e.clientY - last.y);
  }

  private up(e: PointerEvent): void {
    const click = this.pointers.size === 1 && this.travel < CLICK_PX;
    this.pointers.delete(e.pointerId);
    if (click) this.pick(this.cellAt(e.clientX, e.clientY));
  }
}

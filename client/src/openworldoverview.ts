// The overview of the Open world (#976): the whole world seen from high up, a texture with one pixel a cell, one colour a
// terrain. It is painted straight from the raw bytes of the loader, a few chunks a frame, the chunks nearest the hero
// first, and keeps nothing per chunk but one painted flag: no tile objects, no cache of the world (World keeps its own).
import * as THREE from 'three/webgpu';
import { CHUNK, WORLD_CHUNKS } from './openworld';

/** The cells of the world a side: one texel each. */
export const SIDE = WORLD_CHUNKS * CHUNK;
/** The first chunk of the world along each axis: the world is WORLD_CHUNKS chunks centred on the spawn. */
const FIRST = -WORLD_CHUNKS / 2;
const CHUNKS = WORLD_CHUNKS * WORLD_CHUNKS;
/** The colour of a cell not painted yet, the sky of the Open world. */
const BACKGROUND = [0x0b, 0x12, 0x20, 255];

export class Overview {
  /** The texture, `SIDE` texels a side: texel (q + SIDE / 2, r + SIDE / 2) is the cell (q, r). */
  readonly texture: THREE.DataTexture;
  readonly pixels: Uint8Array;
  private readonly painted = new Uint8Array(CHUNKS);
  /** The chunks by distance from the chunk the painting started from; `next` is the cursor in this order. */
  private readonly order = new Int32Array(CHUNKS);
  private readonly start = new Int32Array(WORLD_CHUNKS + 1); // counting sort of the order: first index of each distance
  private next = CHUNKS;
  private from = [NaN, NaN];

  /** `load(cx, cy)` gives the raw bytes of a chunk, 2 a cell (height, terrain code); `palette` is 4 bytes a terrain code. */
  constructor(
    private readonly load: (cx: number, cy: number) => Uint8Array,
    private readonly palette: Uint8Array,
  ) {
    this.pixels = new Uint8Array(SIDE * SIDE * 4);
    for (let i = 0; i < this.pixels.length; i += 4) this.pixels.set(BACKGROUND, i);
    this.texture = new THREE.DataTexture(this.pixels, SIDE, SIDE, THREE.RGBAFormat);
    // A cell is a texel close up (nearest), and the mip levels keep a far world from shimmering (SIDE is a power of two).
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  /** Paints up to `max` chunks not painted yet, nearest the chunk `(cx, cy)` first; reports whether it painted any. */
  paint(cx: number, cy: number, max: number): boolean {
    this.aim(cx, cy);
    let done = 0;
    while (done < max && this.next < CHUNKS) {
      const i = this.order[this.next++]!;
      if (this.painted[i]) continue;
      this.painted[i] = 1;
      this.stamp(FIRST + Math.floor(i / WORLD_CHUNKS), FIRST + (i % WORLD_CHUNKS));
      done++;
    }
    if (done > 0) this.texture.needsUpdate = true;
    return done > 0;
  }

  /** Frees the texture. */
  dispose(): void {
    this.texture.dispose();
  }

  /** Orders the chunks by their distance from `(cx, cy)`, nearest first, when the chunk changed: a counting sort. */
  private aim(cx: number, cy: number): void {
    if (cx === this.from[0] && cy === this.from[1]) return;
    this.from = [cx, cy];
    const distance = (i: number): number =>
      Math.min(WORLD_CHUNKS - 1, Math.max(Math.abs(FIRST + Math.floor(i / WORLD_CHUNKS) - cx), Math.abs(FIRST + (i % WORLD_CHUNKS) - cy)));
    this.start.fill(0);
    for (let i = 0; i < CHUNKS; i++) this.start[distance(i) + 1]! += 1;
    for (let d = 1; d <= WORLD_CHUNKS; d++) this.start[d] = this.start[d]! + this.start[d - 1]!;
    for (let i = 0; i < CHUNKS; i++) this.order[this.start[distance(i)]!++] = i;
    this.next = 0;
  }

  /** Writes the cells of a chunk into the texture, one pixel each; a chunk with no bytes (off the world) stays as it was. */
  private stamp(cx: number, cy: number): void {
    const bytes = this.load(cx, cy);
    const x0 = cx * CHUNK + SIDE / 2;
    const y0 = cy * CHUNK + SIDE / 2;
    const pixels = this.pixels;
    const palette = this.palette;
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const cell = i >> 1;
      const o = ((y0 + Math.floor(cell / CHUNK)) * SIDE + x0 + (cell % CHUNK)) * 4;
      const p = bytes[i + 1]! * 4;
      pixels[o] = palette[p]!;
      pixels[o + 1] = palette[p + 1]!;
      pixels[o + 2] = palette[p + 2]!;
      pixels[o + 3] = palette[p + 3]!;
    }
  }
}

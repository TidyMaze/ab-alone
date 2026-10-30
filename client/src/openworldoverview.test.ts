import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { CHUNK, WORLD_CHUNKS } from './openworld';
import { Overview, SIDE } from './openworldoverview';

// Palette: code c paints (c + 1, c + 2, c + 3), opaque, so a pixel tells its terrain code.
const PALETTE = Uint8Array.from({ length: 8 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i >> 2) + (i % 4) + 1));
const pixel = (o: Overview, q: number, r: number): number[] => {
  const i = ((r + SIDE / 2) * SIDE + (q + SIDE / 2)) * 4;
  return Array.from(o.pixels.subarray(i, i + 4));
};
// Every cell of a chunk has the terrain code of its column: cell i has code (i % CHUNK) % 8.
const chunk = (): Uint8Array => {
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out[2 * i + 1] = (i % CHUNK) % 8;
  return out;
};
const inWorld = (cx: number, cy: number): boolean => cx >= -32 && cx < 32 && cy >= -32 && cy < 32;

describe('the overview of the Open world (#976)', () => {
  it('paints each cell of a chunk as one pixel of its terrain colour, from the raw bytes', () => {
    const load = vi.fn((cx: number, cy: number) => (inWorld(cx, cy) ? chunk() : new Uint8Array()));
    const o = new Overview(load, PALETTE);
    o.paint(0, 0, 1);
    expect(load).toHaveBeenCalledWith(0, 0);
    expect(pixel(o, 0, 0)).toEqual([1, 2, 3, 255]); // cell 0: code 0
    expect(pixel(o, 5, 2)).toEqual([6, 7, 8, 255]); // column 5, row 2: code 5
    expect(pixel(o, 16, 0)).toEqual([0x0b, 0x12, 0x20, 255]); // the next chunk is not painted yet
  });

  it('paints at most the budget a call, each chunk once, and then nothing', () => {
    const load = vi.fn((cx: number, cy: number) => (inWorld(cx, cy) ? chunk() : new Uint8Array()));
    const o = new Overview(load, PALETTE);
    expect(o.paint(0, 0, 10)).toBe(true);
    expect(load).toHaveBeenCalledTimes(10);
    expect(o.paint(0, 0, WORLD_CHUNKS * WORLD_CHUNKS)).toBe(true);
    expect(load).toHaveBeenCalledTimes(WORLD_CHUNKS * WORLD_CHUNKS);
    const seen = new Set(load.mock.calls.map(([cx, cy]) => `${cx},${cy}`));
    expect(seen.size).toBe(WORLD_CHUNKS * WORLD_CHUNKS); // every chunk of the world, once
    expect(o.paint(0, 0, 5)).toBe(false);
    expect(load).toHaveBeenCalledTimes(WORLD_CHUNKS * WORLD_CHUNKS);
  });

  it('paints the chunks nearest the hero first', () => {
    const load = vi.fn((cx: number, cy: number) => (inWorld(cx, cy) ? chunk() : new Uint8Array()));
    const o = new Overview(load, PALETTE);
    o.paint(0, 0, 9);
    const first = load.mock.calls.map(([cx, cy]) => Math.max(Math.abs(cx), Math.abs(cy)));
    expect(first.every((d) => d <= 1)).toBe(true); // the 3 x 3 around the hero's chunk
  });

  it('starts again from the chunks nearest a hero that moved to another chunk', () => {
    const load = vi.fn((cx: number, cy: number) => (inWorld(cx, cy) ? chunk() : new Uint8Array()));
    const o = new Overview(load, PALETTE);
    o.paint(0, 0, 5);
    o.paint(10, -3, 1);
    expect(load).toHaveBeenLastCalledWith(10, -3);
    o.paint(10, -3, 1); // same chunk: no new order, the next chunk of the old one
    expect(load).toHaveBeenCalledTimes(7);
    o.paint(10, -3, WORLD_CHUNKS * WORLD_CHUNKS); // the rest, the chunks painted before skipped: each chunk loaded once
    expect(load).toHaveBeenCalledTimes(WORLD_CHUNKS * WORLD_CHUNKS);
  });

  it('leaves the pixels of a chunk with no bytes as they were', () => {
    const o = new Overview(() => new Uint8Array(), PALETTE);
    expect(o.paint(1, 0, 1)).toBe(true);
    expect(pixel(o, 16, 0)).toEqual([0x0b, 0x12, 0x20, 255]);
  });

  it('shows a cell as one texel close up, mipmapped far off, in sRGB, and frees it on dispose', () => {
    const o = new Overview(() => new Uint8Array(), PALETTE);
    expect(o.texture.magFilter).toBe(THREE.NearestFilter);
    expect(o.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(o.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(o.texture.image.width).toBe(SIDE);
    const dispose = vi.spyOn(o.texture, 'dispose');
    o.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

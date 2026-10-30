// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { CHUNK } from './openworld';
import { OpenWorldMode } from './openworldmode';

// Grass at height 1 everywhere in the square -3..3 of chunks, a boulder on (0, 1).
function bytes(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2], i * 2);
  if (cx === 0 && cy === 0) out.set([1, 5], CHUNK * 2); // (0, 1)
  return out;
}
const mode = (models: () => Promise<Record<string, never>> = async () => ({})) => new OpenWorldMode((_seed, cx, cy) => bytes(cx, cy), models);
const body = () => document.body.dataset;

afterEach(() => {
  delete body().openworld;
  delete body().openworldAt;
});

describe('the Open world mode', () => {
  it('enters on the spawn: marked on the page, drawn once, drawn again only when something changed', () => {
    const m = mode();
    m.enter(42, 800, 600);
    expect(m.active).toBe(true);
    expect(body().openworld).toBe('42');
    expect(body().openworldAt).toBe('0,0');
    const render = vi.fn();
    m.frame(render);
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![0]).toBeInstanceOf(THREE.Scene);
    m.resize(400, 300);
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('draws again when the models arrive', async () => {
    let arrive!: (g: Record<string, never>) => void;
    const m = mode(() => new Promise((resolve) => (arrive = resolve)));
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render);
    arrive({});
    await Promise.resolve();
    await Promise.resolve();
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('rolls the hero on an arrow key, and keeps it before a boulder', () => {
    const m = mode();
    m.enter(1, 800, 600);
    expect(m.key('ArrowRight')).toBe(true);
    expect(m.hero!.at).toEqual([1, 0]);
    expect(body().openworldAt).toBe('1,0');
    expect(m.key('ArrowLeft')).toBe(true);
    expect(m.key('ArrowDown')).toBe(true); // down from the even row 0: (-1, 1) or (0, 1)
    expect(m.key('ArrowDown')).toBe(true);
    expect(m.key('a')).toBe(false);
  });

  it('rolls the hero onto the cell pressed when it is next to it, and ignores a far one', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.press(400, 300, 800, 600); // the centre: the hero's own cell, no move
    expect(m.hero!.at).toEqual([0, 0]);
    m.press(400 + 55, 300, 800, 600); // a cell to the right
    expect(m.hero!.at).toEqual([1, 0]);
    m.press(800, 0, 800, 600); // far away
    expect(m.hero!.at).toEqual([1, 0]);
  });

  it('leaves on Escape and clears its marks', () => {
    const m = mode();
    m.enter(1, 800, 600);
    expect(m.key('Escape')).toBe(true);
    expect(m.active).toBe(false);
    expect(body().openworld).toBeUndefined();
    expect(body().openworldAt).toBeUndefined();
  });

  it('ignores a resize before it is entered', () => {
    const m = mode();
    m.resize(100, 100);
    expect(m.active).toBe(false);
  });
});

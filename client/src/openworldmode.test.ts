// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, neighbours } from './openworld';
import { heldCell, OpenWorldMode } from './openworldmode';
import { MAX_ZOOM, OpenWorldView } from './openworldview';

// Grass at height 1 everywhere in the square -3..3 of chunks, a boulder on (0, 1).
function bytes(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2], i * 2);
  if (cx === 0 && cy === 0) out.set([1, 5], CHUNK * 2); // (0, 1)
  return out;
}
const mode = (models: () => Promise<Record<string, never>> = async () => ({})) => new OpenWorldMode(
    (_seed, cx, cy) => bytes(cx, cy),
    (_seed, cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(5, 5, 6, 5, 7, 5) : new Int32Array()),
    models,
  );
const body = () => document.body.dataset;

afterEach(() => {
  delete body().openworld;
  delete body().openworldAt;
  delete body().openworldTroop;
  delete body().openworldEnemies;
  delete body().openworldZoom;
});

// Screen direction of a step, `[-1 | 0 | 1, -1 | 0 | 1]` for left/right and up/down, from the ground layout of `axialTo3D`.
const screen = (from: Axial, to: Axial): [number, number] => {
  const a = axialTo3D(...from);
  const b = axialTo3D(...to);
  return [Math.sign(Math.round((b.x - a.x) * 100)), Math.sign(Math.round((b.z - a.z) * 100))];
};
const held = (...keys: string[]) => new Set(keys);

describe('heldCell', () => {
  it('gives the diagonal neighbour of each pair of a vertical and a horizontal arrow, on every row', () => {
    for (const at of [[0, 0], [2, 3], [-1, -4]] as Axial[]) {
      const up = heldCell(at, held('ArrowUp', 'ArrowLeft'))!;
      const upRight = heldCell(at, held('ArrowUp', 'ArrowRight'))!;
      const down = heldCell(at, held('ArrowDown', 'ArrowLeft'))!;
      const downRight = heldCell(at, held('ArrowDown', 'ArrowRight'))!;
      expect(screen(at, up)).toEqual([-1, -1]);
      expect(screen(at, upRight)).toEqual([1, -1]);
      expect(screen(at, down)).toEqual([-1, 1]);
      expect(screen(at, downRight)).toEqual([1, 1]);
      for (const cell of [up, upRight, down, downRight]) expect(neighbours(at).some((n) => n[0] === cell[0] && n[1] === cell[1])).toBe(true);
    }
  });

  it('gives nothing for a single arrow, for opposite arrows, or for three arrows', () => {
    const at: Axial = [0, 0];
    expect(heldCell(at, held('ArrowUp'))).toBeNull();
    expect(heldCell(at, held('ArrowLeft', 'ArrowRight'))).toBeNull();
    expect(heldCell(at, held('ArrowUp', 'ArrowDown'))).toBeNull();
    expect(heldCell(at, held('ArrowUp', 'ArrowDown', 'ArrowLeft'))).toBeNull();
    expect(heldCell(at, held('ArrowUp', 'ArrowLeft', 'ArrowRight'))).toBeNull();
    expect(heldCell(at, held())).toBeNull();
  });
});

describe('the Open world mode', () => {
  it('enters on the spawn: marked on the page, drawn once, drawn again only when something changed', () => {
    const m = mode();
    m.enter(42, 800, 600);
    expect(m.active).toBe(true);
    expect(body().openworld).toBe('42');
    expect(body().openworldAt).toBe('0,0');
    expect(body().openworldEnemies).toBe('3');
    expect(body().openworldTroop!.split(' ')).toHaveLength(6);
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

  it('rolls the hero on the diagonal of two held arrows, and keeps walking while they are held', () => {
    const m = mode();
    m.enter(1, 800, 600);
    expect(m.key('ArrowLeft')).toBe(true);
    expect(m.hero!.at).toEqual([-1, 0]);
    expect(m.key('ArrowUp')).toBe(true); // Left and Up held: up-left from (-1, 0)
    expect(m.hero!.at).toEqual([-1, -1]);
    expect(m.key('ArrowUp')).toBe(true); // the key repeats: up-left again
    expect(m.hero!.at).toEqual([-1, -2]);
  });

  it('does nothing for opposite arrows held together, and a release drops the key', () => {
    const m = mode();
    m.enter(1, 800, 600);
    expect(m.key('ArrowLeft')).toBe(true);
    expect(m.hero!.at).toEqual([-1, 0]);
    expect(m.key('ArrowRight')).toBe(true); // Left and Right: nothing
    expect(m.hero!.at).toEqual([-1, 0]);
    m.release('ArrowLeft');
    expect(m.key('ArrowRight')).toBe(true); // Right alone rolls again
    expect(m.hero!.at).toEqual([0, 0]);
  });

  it('forgets the held keys when the window loses focus or the mode is left', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.key('ArrowUp'); // (1, -1) from the even spawn row
    m.release(); // blur: no key is held any more
    expect(m.key('ArrowLeft')).toBe(true);
    expect(m.hero!.at).toEqual([0, -1]); // a single arrow, not a diagonal with Up
    m.key('Escape'); // leaving clears the held keys too
    m.enter(1, 800, 600);
    expect(m.key('ArrowUp')).toBe(true);
    expect(m.hero!.at).toEqual([1, -1]); // single Up from the spawn, Left is not held
  });

  it('zooms the Open world camera, and an entry starts at the closest view again, #976', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.zoom(2);
    expect(body().openworldZoom).toBe('2');
    const camera = (): THREE.Camera => {
      const render = vi.fn();
      m.frame(render);
      return render.mock.calls[0]![1] as THREE.Camera;
    };
    expect(camera().position.y).toBeCloseTo(28);
    m.enter(1, 800, 600);
    expect(body().openworldZoom).toBe('1');
    expect(camera().position.y).toBeCloseTo(14);
  });

  it('does not roll the hero on a click in the overview, and keeps the close range click', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.press(400 + 55, 300, 800, 600); // a cell to the right: rolls at the close range
    expect(m.hero!.at).toEqual([1, 0]);
    m.zoom(MAX_ZOOM);
    m.press(400 - 55, 300, 800, 600); // the same press in the overview: nothing
    expect(m.hero!.at).toEqual([1, 0]);
  });

  it('keeps drawing while the overview paints, then stops', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.zoom(MAX_ZOOM);
    const render = vi.fn();
    for (let i = 0; i < 200; i++) m.frame(render);
    const drawn = render.mock.calls.length;
    expect(drawn).toBeGreaterThan(1);
    m.frame(render);
    expect(render.mock.calls.length).toBe(drawn);
  });

  it('frees the overview when it is left', () => {
    const m = mode();
    m.enter(1, 800, 600);
    const dispose = vi.spyOn(OpenWorldView.prototype, 'disposeOverview');
    m.leave();
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
  });

  it('ignores a resize before it is entered', () => {
    const m = mode();
    m.resize(100, 100);
    expect(m.active).toBe(false);
  });
});

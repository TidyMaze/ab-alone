// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, neighbours } from './openworld';
import { heldCell, OpenWorldMode } from './openworldmode';
import { FightState } from './openworldfight';
import { worldSaves, type WorldSaves, type WorldSave } from './openworldsave';
import { memoryStore } from './savegame';
import { MAX_ZOOM, maxZoomFor, OpenWorldView, type PropModels, topOf } from './openworldview';

// Grass at height 1 everywhere in the square -3..3 of chunks, a boulder on (0, 1).
function bytes(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 0], i * 3);
  if (cx === 0 && cy === 0) out.set([1, 5, 0], CHUNK * 3); // (0, 1)
  return out;
}
// A lake everywhere in the square -3..3 of chunks.
function sea(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 0, 0], i * 3);
  return out;
}
type PushBridge = (seed: number, troop: Int32Array, enemies: Int32Array) => Int32Array;
const noPush: PushBridge = () => new Int32Array();
const mode = (
  models: () => Promise<PropModels> = async () => ({ low: {}, high: {} }),
  load: (seed: number, cx: number, cy: number) => Uint8Array = (_seed, cx, cy) => bytes(cx, cy),
  reduced: () => boolean = () => true,
  foes: (seed: number, cx: number, cy: number) => Int32Array = (_seed, cx, cy) =>
    cx === 0 && cy === 0 ? Int32Array.of(5, 5, 6, 5, 7, 5) : new Int32Array(),
  push: PushBridge = noPush,
  saves: WorldSaves = worldSaves(memoryStore(), 1),
) => new OpenWorldMode(load, foes, models, reduced, push, saves);
const body = () => document.body.dataset;

afterEach(() => {
  delete body().openworld;
  delete body().openworldAt;
  delete body().openworldTroop;
  delete body().openworldEnemies;
  delete body().openworldZoom;
  delete body().openworldDrawn;
  delete body().openworldBeaten;
  delete body().openworldPush;
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
    let arrive!: (g: PropModels) => void;
    const m = mode(() => new Promise((resolve) => (arrive = resolve)));
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render);
    arrive({ low: {}, high: {} });
    await Promise.resolve();
    await Promise.resolve();
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('draws the detailed props near the hero once their models arrive, and publishes the count (#989)', async () => {
    let arrive!: (g: PropModels) => void;
    const m = mode(() => new Promise((resolve) => (arrive = resolve)));
    m.enter(1, 800, 600);
    expect(JSON.parse(body().openworldDrawn!)['prop-boulder']).toBe(1);
    arrive({ low: {}, high: { boulder: new THREE.BoxGeometry() } });
    await Promise.resolve();
    await Promise.resolve();
    const drawn = JSON.parse(body().openworldDrawn!);
    expect(drawn['prop-boulder-hi']).toBe(1); // the boulder at (0, 1) is near the hero
    expect(drawn['prop-boulder']).toBe(0);
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

  it('clamps the zoom to a wider screen its widest zoom, and publishes the clamped zoom, #976', () => {
    const m = mode();
    m.enter(1, 1600, 900);
    m.zoom(1e9);
    expect(body().openworldZoom).toBe(String(maxZoomFor(1600 / 900)));
    m.resize(3840, 1080);
    expect(body().openworldZoom).toBe(String(maxZoomFor(3840 / 1080)));
    expect(Number(body().openworldZoom)).toBeLessThan(maxZoomFor(1600 / 900));
  });

  it('publishes nothing on a resize after the mode is left', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.leave();
    m.resize(1600, 900);
    expect(body().openworldZoom).toBeUndefined();
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
    const top = topOf('grass', 1) + 0.3; // the spawn is grass at height 1 in this file: its column top and the marble on it (#988)
    expect(camera().position.y).toBeCloseTo(28 + top);
    m.enter(1, 800, 600);
    expect(body().openworldZoom).toBe('1');
    expect(camera().position.y).toBeCloseTo(14 + top);
  });

  it('publishes what is drawn at the zoom, the props among it, for the browser checks, #976', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.zoom(2);
    const drawn = JSON.parse(body().openworldDrawn!) as Record<string, number>;
    expect(drawn['terrain-grass']).toBeGreaterThan(0);
    expect(drawn['prop-boulder']).toBeGreaterThan(0);
    expect(drawn.troop).toBe(6);
    expect(drawn.enemies).toBe(3);
  });

  it('rolls the hero onto the cell picked by a click at the widest zoom too, #976', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.zoom(MAX_ZOOM);
    const pick = vi.spyOn(OpenWorldView.prototype, 'pick').mockReturnValue([1, 0]);
    m.press(400, 300, 800, 600);
    expect(pick).toHaveBeenCalled();
    expect(m.hero!.at).toEqual([1, 0]);
    pick.mockRestore();
  });

  it('ignores a resize before it is entered', () => {
    const m = mode();
    m.resize(100, 100);
    expect(m.active).toBe(false);
  });

  it('draws every frame while a lake is in view and motion is on, and moves the glow of the water', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const m = mode(undefined, sea, () => false);
    m.enter(1, 800, 600);
    const glow: number[] = [];
    const render = vi.fn((scene: THREE.Scene) => {
      const water = scene.getObjectByName('terrain-water') as THREE.InstancedMesh;
      glow.push((water.material as THREE.MeshStandardMaterial).emissiveIntensity);
    });
    m.frame(render);
    now.mockReturnValue((1200 * Math.PI) / 2);
    m.frame(render);
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(3);
    expect(glow[0]).toBeCloseTo(1);
    expect(glow[1]).toBeCloseTo(1.15);
    now.mockRestore();
  });

  it('holds the lake still with reduced motion: drawn only when something changed', () => {
    const m = mode(undefined, sea, () => true);
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render);
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(1);
    m.resize(400, 300);
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('draws only when something changed, with motion on, when no lake is in view', () => {
    const m = mode(undefined, (_seed, cx, cy) => bytes(cx, cy), () => false);
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render);
    m.frame(render);
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe('a frame frees what it replaced only after its render (#1017)', () => {
  it('drains the view after the frame is rendered, never before', () => {
    const drain = vi.spyOn(OpenWorldView.prototype, 'drain');
    const m = mode();
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(drain.mock.invocationCallOrder[0]).toBeGreaterThan(render.mock.invocationCallOrder[0]!);
    vi.restoreAllMocks();
  });
});

// The bridge's push of a step, echoing the troop it is given (the hero's cell first) and moving the enemy (3,0) to nowhere: the
// hero stays where it is, the troop too; one enemy is left, at (3,0), and nothing is ejected (docs/specs/openworld.md section 4).
const echo = (troop: Int32Array): Int32Array => Int32Array.of(0, 0, 0, troop.length / 2, ...troop, 1, 3, 0, 1, 0);

describe('the troop pushes after a step (docs/specs/openworld.md section 4, #967)', () => {
  it('plays the push of a step: the hero and the troop move to the cells of the bridge, the enemy moves and the counts are published', () => {
    const push = vi.fn<PushBridge>(() => new Int32Array());
    push.mockImplementationOnce(() => Int32Array.of(0, 0, 0, 3, 2, 0, 1, 0, 0, 0, 1, 3, 0, 1, 0));
    const m = mode(undefined, undefined, undefined, (_seed, cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(2, 0) : new Int32Array()), push);
    m.enter(1, 800, 600);
    expect(body().openworldPush).toBe('0');
    expect(m.key('ArrowRight')).toBe(true);
    expect(m.hero!.at).toEqual([2, 0]);
    expect(body().openworldAt).toBe('2,0');
    expect(body().openworldTroop).toBe('1,0 0,0');
    expect(body().openworldEnemies).toBe('1');
    expect(body().openworldPush).toBe('1');
    expect(body().openworldBeaten).toBe('0');
    const [seed, troop, enemies] = push.mock.calls[0]!;
    expect(seed).toBe(1);
    expect(Array.from(troop.slice(0, 4))).toEqual([1, 0, 0, 0]); // the hero's cell, then the troop's: the cell it left first
    expect(troop).toHaveLength(14);
    expect(Array.from(enemies)).toEqual([2, 0]); // the enemies within 10 cells of the hero
  });

  it('blocks the hero on the cell a pushed enemy now stands on, and frees the cell it stood on', () => {
    const push = vi.fn<PushBridge>(() => new Int32Array());
    push.mockImplementationOnce((_seed, troop) => echo(troop));
    const m = mode(undefined, undefined, undefined, (_seed, cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(2, 0) : new Int32Array()), push);
    m.enter(1, 800, 600);
    m.key('ArrowRight'); // the step pushes the enemy from (2,0) to (3,0)
    expect(body().openworldAt).toBe('1,0');
    expect(m.key('ArrowRight')).toBe(true); // onto (2,0), its old cell: free
    expect(body().openworldAt).toBe('2,0');
    m.key('ArrowRight'); // onto (3,0): the pushed enemy stands there
    expect(body().openworldAt).toBe('2,0');
    expect(push).toHaveBeenCalledTimes(2); // the refused step asks the bridge for nothing
  });

  it('plays nothing when the bridge gives no push: the enemies stay and no push is counted', () => {
    const m = mode(undefined, undefined, undefined, (_seed, cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(2, 0) : new Int32Array()));
    m.enter(1, 800, 600);
    m.key('ArrowRight');
    expect(body().openworldAt).toBe('1,0');
    expect(body().openworldPush).toBe('0');
    expect(body().openworldEnemies).toBe('1');
    expect(body().openworldBeaten).toBe('0');
  });

  it('counts an ejected enemy as beaten, and its cell is free', () => {
    const push = vi.fn<PushBridge>(() => new Int32Array());
    // The enemy (2,0) falls into water: the bridge's ejected cell, kind 1, no enemy left, the hero stays at (1,0).
    push.mockImplementationOnce((_seed, troop) => Int32Array.of(2, 0, 1, troop.length / 2, ...troop, 0, 1, 0));
    const m = mode(undefined, undefined, undefined, (_seed, cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(2, 0) : new Int32Array()), push);
    m.enter(1, 800, 600);
    m.key('ArrowRight');
    expect(body().openworldBeaten).toBe('1');
    expect(body().openworldPush).toBe('1');
    expect(body().openworldEnemies).toBe('0');
    expect(m.enemies()).toEqual([]);
    expect(m.key('ArrowRight')).toBe(true);
    expect(body().openworldAt).toBe('2,0');
  });

  it('pushes after a diagonal step too', () => {
    const push = vi.fn<PushBridge>(() => new Int32Array());
    const m = mode(undefined, undefined, undefined, undefined, push);
    m.enter(1, 800, 600);
    m.key('ArrowUp'); // one step
    m.key('ArrowRight'); // Up and Right held: the diagonal step
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh fight on each entry: the pushed enemies and the counts are the generated ones again', () => {
    const push = vi.fn<PushBridge>(() => new Int32Array());
    push.mockImplementationOnce((_seed, troop) => echo(troop));
    const m = mode(undefined, undefined, undefined, (_seed, cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(2, 0) : new Int32Array()), push);
    m.enter(1, 800, 600);
    m.key('ArrowRight');
    expect(body().openworldPush).toBe('1');
    m.leave();
    expect(body().openworldPush).toBeUndefined();
    expect(body().openworldBeaten).toBeUndefined();
    m.enter(1, 800, 600);
    expect(body().openworldPush).toBe('0');
    expect(body().openworldEnemies).toBe('1');
    expect(m.enemies()).toEqual([[2, 0]]);
  });

  it('a test fixture replaces the hero, the troop and the enemies of the loaded square, and draws them', () => {
    const m = mode();
    m.enter(1, 800, 600);
    m.fixture({ hero: [0, 0], troop: [[-1, 0], [-2, 0]], enemies: [[2, 0]] });
    expect(body().openworldAt).toBe('0,0');
    expect(body().openworldTroop).toBe('-1,0 -2,0');
    expect(body().openworldEnemies).toBe('1');
    expect(m.enemies()).toEqual([[2, 0]]);
  });
});

describe('leaving the Open world frees its view, every time (#981)', () => {
  it('enters and leaves 30 times: each view is disposed, with each of its geometries and materials once', () => {
    const disposeView = vi.spyOn(OpenWorldView.prototype, 'dispose');
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const disposeMaterial = vi.spyOn(THREE.Material.prototype, 'dispose');
    const m = mode();
    for (let i = 0; i < 30; i++) {
      m.enter(i, 800, 600);
      m.frame(() => {});
      m.leave();
    }
    const views = disposeView.mock.contexts as OpenWorldView[];
    expect(views).toHaveLength(30);
    let geometries = 0;
    let materials = 0;
    for (const view of views) {
      const seen = { g: new Set<THREE.BufferGeometry>(), m: new Set<THREE.Material>() };
      view.scene.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return;
        seen.g.add((object as THREE.Mesh).geometry);
        seen.m.add((object as THREE.Mesh).material as THREE.Material);
      });
      geometries += seen.g.size;
      materials += seen.m.size;
    }
    expect(disposeGeometry).toHaveBeenCalledTimes(geometries);
    expect(disposeMaterial).toHaveBeenCalledTimes(materials);
    expect(m.active).toBe(false);
    vi.restoreAllMocks();
  });

  it('does not draw or touch a view once it is left, even when the models arrive late', async () => {
    let arrive!: (g: PropModels) => void;
    const m = mode(() => new Promise((resolve) => (arrive = resolve)));
    m.enter(1, 800, 600);
    m.leave();
    const render = vi.fn();
    arrive({ low: {}, high: {} });
    await Promise.resolve();
    await Promise.resolve();
    m.frame(render);
    expect(render).not.toHaveBeenCalled();
  });
});

describe('the Open world models are loaded once per page (#981)', () => {
  it('loads the models the first time the mode is entered, not on every entry', async () => {
    const models = vi.fn(async (): Promise<PropModels> => ({ low: {}, high: {} }));
    const m = mode(models);
    m.enter(1, 800, 600);
    m.leave();
    m.enter(2, 800, 600);
    m.leave();
    expect(models).toHaveBeenCalledTimes(1);
  });
});

// Grass at height 1, and the cell (1, 0) at height 4: a step up a cliff of 3 levels (#988).
function cliff(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 0], i * 3);
  if (cx === 0 && cy === 0) out.set([4, 2, 0], 3); // (1, 0) is index 1 of its chunk
  return out;
}

describe('the camera eases up a cliff (#988)', () => {
  it('draws every frame while the camera eases to the top of the cliff, then draws nothing once it has settled', () => {
    const m = mode(undefined, cliff, () => false);
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render, 0);
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(body().openworldAt).toBe('1,0');
    const drawn: boolean[] = [];
    for (let frame = 1; frame <= 60; frame++) {
      const before = render.mock.calls.length;
      m.frame(render, (frame * 1000) / 60);
      drawn.push(render.mock.calls.length > before);
    }
    expect(drawn.slice(0, 30).every(Boolean)).toBe(true); // every frame of the first half second
    expect(drawn.slice(50).some(Boolean)).toBe(false); // settled: nothing left to draw
  });

  it('jumps to the top of the cliff at once with reduced motion: one draw, then none', () => {
    const m = mode(undefined, cliff, () => true);
    m.enter(1, 800, 600);
    const render = vi.fn();
    m.frame(render, 0);
    render.mockClear();
    m.key('ArrowRight');
    m.release('ArrowRight');
    for (let frame = 1; frame <= 60; frame++) m.frame(render, (frame * 1000) / 60);
    expect(render).toHaveBeenCalledTimes(1);
  });
});

// The bridge's push of the e2e fixture (#967): the hero's line (the hero and the first two troop marbles, the first two pairs) moves
// one cell right, the enemy (2,0) goes to (3,0), the third marble stays. The troop keeps its order.
const shove: PushBridge = (_seed, troop) => {
  const moved = Int32Array.from(troop);
  moved[0]! += 1;
  moved[2]! += 1;
  return Int32Array.of(0, 0, 0, troop.length / 2, ...moved, 1, 3, 0, 1, 0);
};

describe("the troop's push animation in the mode (docs/specs/openworld.md section 4, #967)", () => {
  // The fixture of the e2e push: the hero (0,0), the troop (-1,0) and (-2,0), the enemy (2,0). A Right press pushes it on to (3,0).
  const pushing = (reduced = false): OpenWorldMode => {
    const m = mode(undefined, undefined, () => reduced, undefined, shove);
    m.enter(1, 800, 600);
    m.fixture({ hero: [0, 0], troop: [[-1, 0], [-2, 0]], enemies: [[2, 0]] });
    return m;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { __openworldSlow?: number }).__openworldSlow;
  });

  it('plays the animation of the push, and reduced motion plays none', () => {
    const play = vi.spyOn(OpenWorldView.prototype, 'playPush');
    pushing().key('ArrowRight');
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0]![0].push.enemies).toEqual([[3, 0]]);
    expect(play.mock.calls[0]![2]).toBe(1);
    play.mockClear();
    pushing(true).key('ArrowRight');
    expect(play).not.toHaveBeenCalled();
  });

  it('marks the animation while it runs, draws every frame of it, and unmarks it at its end', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0); // the push starts at the press
    const m = pushing();
    const render = vi.fn();
    m.frame(render, 0);
    m.key('ArrowRight');
    expect(body().openworldAnim).toBe('1');
    render.mockClear();
    for (const now of [100, 200, 300, 400]) m.frame(render, now);
    expect(render).toHaveBeenCalledTimes(4);
    m.frame(render, 410); // the frame that ends it draws the final cells, and the mark goes
    expect(body().openworldAnim).toBeUndefined();
    render.mockClear();
    m.frame(render, 500);
    expect(render).not.toHaveBeenCalled();
  });

  it('a step during the animation snaps it first, then the new push plays', () => {
    const snap = vi.spyOn(OpenWorldView.prototype, 'snap');
    const play = vi.spyOn(OpenWorldView.prototype, 'playPush');
    const m = pushing();
    snap.mockClear(); // the fixture snaps too
    play.mockClear();
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    m.frame(vi.fn(), 100);
    m.release('ArrowRight');
    m.key('ArrowLeft'); // the hero rolls back (the enemy on (3,0) blocks the way on): the bridge pushes again
    expect(snap).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
    expect(snap.mock.invocationCallOrder[1]).toBeLessThan(play.mock.invocationCallOrder[1]!);
  });

  it('a zoom and a resize during the animation snap it too', () => {
    const snap = vi.spyOn(OpenWorldView.prototype, 'snap');
    const m = pushing();
    snap.mockClear(); // the fixture snaps too
    m.frame(vi.fn(), 0);
    m.key('ArrowRight');
    snap.mockClear();
    m.zoom(1.2);
    expect(snap).toHaveBeenCalledTimes(1);
    m.resize(400, 300);
    expect(snap).toHaveBeenCalledTimes(2);
  });

  it('leaving the mode cancels the animation: no mark, nothing drawn', () => {
    const m = pushing();
    const render = vi.fn();
    m.frame(render, 0);
    m.key('ArrowRight');
    m.key('Escape');
    expect(body().openworldAnim).toBeUndefined();
    render.mockClear();
    m.frame(render, 100);
    expect(render).not.toHaveBeenCalled();
  });

  it('stretches the animation by the slow factor of the page, read when it starts (a webdriver check)', () => {
    const play = vi.spyOn(OpenWorldView.prototype, 'playPush');
    (window as { __openworldSlow?: number }).__openworldSlow = 10;
    pushing().key('ArrowRight');
    expect(play.mock.calls[0]![2]).toBe(10);
  });
});

describe('the Open world save in the mode (docs/specs/openworld.md section 5, #968)', () => {
  const settle = () => new Promise((done) => setTimeout(done)); // the store's writes are microtasks
  const frameOf = (m: OpenWorldMode) => m.frame(vi.fn());
  // A saved world of seed 7: the hero on (2,0), the troop on (1,0) and (0,0), a generated enemy pushed on to (3,0), one beaten.
  const fightSaved = () => {
    const fight = new FightState();
    fight.apply([], [[3, 0]], [[9, 9]]);
    return fight.toJSON();
  };
  const savedWorld = (): WorldSave => ({ version: 1, seed: 7, hero: [2, 0], troop: [[1, 0], [0, 0]], fight: fightSaved(), savedAt: 1 });
  const withSaves = (store = memoryStore()) => {
    const saves = worldSaves(store, 1);
    return { store, saves, m: mode(undefined, undefined, undefined, undefined, undefined, saves) };
  };

  it('a saved world is applied before the first draw: the hero, the troop, the fight and the beaten count', () => {
    const { m } = withSaves();
    m.enter(7, 800, 600, savedWorld());
    expect(body().openworldAt).toBe('2,0');
    expect(body().openworldTroop).toBe('1,0 0,0');
    expect(body().openworldBeaten).toBe('1');
    expect(m.enemies()).toContainEqual([3, 0]);
    const render = vi.fn();
    m.frame(render);
    expect(render).toHaveBeenCalledOnce();
  });

  it('a step is saved once the frame runs, with the cell it reached and the seed', async () => {
    delete body().openworldSaved;
    const { m, store } = withSaves();
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    expect(store.data.has('openworld:7')).toBe(false); // not before the frame
    frameOf(m);
    await settle();
    expect(store.data.get('openworld:7')).toMatchObject({ version: 1, seed: 7, hero: [1, 0], fight: { removed: [], added: [], beaten: 0 } });
    expect(body().openworldSaved).toBe('1');
  });

  it('a frame with nothing new writes nothing', async () => {
    const { m, saves } = withSaves();
    const put = vi.spyOn(saves, 'put');
    m.enter(7, 800, 600);
    frameOf(m);
    await settle();
    expect(put).not.toHaveBeenCalled();
  });

  it('steps between two frames are one write, of the last state', async () => {
    const { m, saves } = withSaves();
    const put = vi.spyOn(saves, 'put');
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    m.key('ArrowRight');
    m.key('ArrowRight');
    frameOf(m);
    frameOf(m);
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]![1]).toEqual([3, 0]);
  });

  it('a push is saved with the step: the enemy pushed on to (3,0) is in the save', async () => {
    const store = memoryStore();
    const m = mode(undefined, undefined, undefined, undefined, shove, worldSaves(store, 1));
    m.enter(7, 800, 600);
    m.fixture({ hero: [0, 0], troop: [[-1, 0], [-2, 0]], enemies: [[2, 0]] });
    m.key('ArrowRight');
    frameOf(m);
    await settle();
    const saved = store.data.get('openworld:7') as WorldSave;
    expect(saved.hero).toEqual([2, 0]);
    expect(saved.fight.added).toEqual([[3, 0]]);
  });

  it('leaving saves the final state at once, before any frame', async () => {
    const { m, store } = withSaves();
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    m.leave();
    await settle();
    expect((store.data.get('openworld:7') as WorldSave).hero).toEqual([1, 0]);
  });

  it('entering another world saves the one entered before', async () => {
    const { m, store } = withSaves();
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    m.enter(8, 800, 600);
    await settle();
    expect((store.data.get('openworld:7') as WorldSave).hero).toEqual([1, 0]);
    expect(store.data.has('openworld:8')).toBe(false);
  });

  it('a save the storage refuses is not counted, and the game goes on', async () => {
    delete body().openworldSaved;
    const broken = worldSaves(
      {
        get: async () => Promise.reject(new Error('blocked')),
        put: async () => Promise.reject(new Error('blocked')),
        delete: async () => Promise.reject(new Error('blocked')),
      },
      1,
    );
    const m = mode(undefined, undefined, undefined, undefined, undefined, broken);
    m.enter(7, 800, 600);
    m.key('ArrowRight');
    frameOf(m);
    await settle();
    expect(body().openworldSaved).toBeUndefined();
    expect(body().openworldAt).toBe('1,0');
  });

  it('opens the saved world of a seed and remembers that seed as the last one played', async () => {
    const { m, store, saves } = withSaves();
    store.data.set('openworld:7', savedWorld());
    await m.open(7, 800, 600);
    expect(body().openworldAt).toBe('2,0');
    expect(await saves.last()).toBe(7);
  });

  it('opened with resume off, a world starts on the spawn whatever is saved for its seed', async () => {
    const { m, store } = withSaves();
    store.data.set('openworld:7', savedWorld());
    await m.open(7, 800, 600, false);
    expect(body().openworldAt).toBe('0,0');
  });

  it('a stale save is deleted when the world opens, which then starts fresh', async () => {
    const { m, store } = withSaves();
    store.data.set('openworld:7', { ...savedWorld(), version: 0 });
    await m.open(7, 800, 600);
    expect(body().openworldAt).toBe('0,0');
    expect(store.data.has('openworld:7')).toBe(false);
  });
});

// @vitest-environment jsdom
import './test/openworldwasm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, chunkOf, World } from './openworld';
import { CAIRN_CAPACITY, CAIRN_LOOK, GROUND, OpenWorldView, topOf } from './openworldview';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The cairns of the Open world (#1533, docs/specs/openworld.md section 13): a stack of stones under a sodium cap on each cairn of the
// loaded chunks, so no open cell lies far from a landmark. Grass everywhere in the square -12..12 of chunks, at level 2.
function grass(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 12 || Math.abs(cy) > 12) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}
/** A world whose chunks hold the cairns of `cells`, each in its own chunk; `load` hears each chunk read. */
const withCairns = (cells: readonly Axial[], load: (cx: number, cy: number) => void = () => {}) =>
  new World(grass, undefined, (cx, cy) => {
    load(cx, cy);
    return Int32Array.from(cells.filter((c) => chunkOf(c)[0] === cx && chunkOf(c)[1] === cy).flat());
  });
const mesh = (view: OpenWorldView | THREE.Scene, name: string) => ('scene' in view ? view.scene : view).getObjectByName(name) as THREE.InstancedMesh;
const placed = (view: OpenWorldView, name: string): THREE.Matrix4[] =>
  Array.from({ length: mesh(view, name).count }, (_, i) => {
    const m = new THREE.Matrix4();
    mesh(view, name).getMatrixAt(i, m);
    return m;
  });
const at = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m);

describe('the look of a cairn (#1533)', () => {
  it('stands a stack of stones and a glowing cap on each cairn of the loaded chunks, none farther', () => {
    const far: Axial = [12 * CHUNK, 0];
    const view = new OpenWorldView(withCairns([[3, 0], [-2, 1], far]));
    view.show([0, 0]);
    expect(Math.abs(chunkOf(far)[0])).toBeGreaterThan(view.reach);
    const stones = placed(view, 'cairn').map(at);
    expect(stones).toHaveLength(2);
    expect(placed(view, 'cairn-cap')).toHaveLength(2);
    const p = axialTo3D(-2, 1); // the chunks are laid row by row: chunk (-1, 0) before (0, 0)
    expect([stones[0]!.x, stones[0]!.z]).toEqual([p.x, p.z].map((v) => expect.closeTo(v)));
    expect(stones[0]!.y).toBeCloseTo(topOf(GROUND.grass, 2, -2, 1));
    const cap = mesh(view, 'cairn-cap').material as THREE.MeshStandardMaterial;
    expect(cap.emissive.getHex()).toBe(CAIRN_LOOK.cap);
    expect((mesh(view, 'cairn').material as THREE.MeshStandardMaterial).color.getHex()).toBe(CAIRN_LOOK.stone);
    expect(mesh(view, 'cairn').castShadow).toBe(true);
  });

  it('gives each cairn its own turn and height from its cell, the stones and the cap alike', () => {
    const view = new OpenWorldView(withCairns([[3, 0], [21, 2]]));
    view.show([0, 0]);
    const [a, b] = placed(view, 'cairn');
    const [ca, cb] = placed(view, 'cairn-cap');
    expect(a!.elements).not.toEqual(b!.elements);
    expect(ca!.elements).toEqual(a!.elements);
    expect(cb!.elements).toEqual(b!.elements);
    const tall = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixScale(m).y;
    for (const m of [a!, b!]) expect(tall(m)).toBeGreaterThanOrEqual(1 - CAIRN_LOOK.spread - 1e-9);
    for (const m of [a!, b!]) expect(tall(m)).toBeLessThanOrEqual(1 + CAIRN_LOOK.spread + 1e-9);
  });

  it('lays the ones of the new chunks when the loaded square moves, reads a chunk once, and never lays more than its room', () => {
    const load = vi.fn();
    const far: Axial = [12 * CHUNK + 3, 0];
    const view = new OpenWorldView(withCairns([[3, 0], far], load));
    view.show([0, 0]);
    expect(mesh(view, 'cairn').count).toBe(1);
    view.show(far);
    expect(placed(view, 'cairn').map(at).some((v) => Math.abs(v.x - axialTo3D(...far).x) < 1e-6)).toBe(true);
    expect(load.mock.calls.filter(([cx, cy]) => cx === 0 && cy === 0)).toHaveLength(1);
    const crowded = new OpenWorldView(new World(grass, undefined, () => Int32Array.from(Array.from({ length: CAIRN_CAPACITY }, () => [1, 1]).flat())));
    crowded.show([0, 0]);
    expect(mesh(crowded, 'cairn').count).toBe(CAIRN_CAPACITY);
  });
});

describe('the cairns of the Open world mode (#1533)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads the cairns of each chunk of the seed and stands one on each', () => {
    const cairnsOf = vi.fn((_seed: number, cx: number, cy: number) => (cx === 0 && cy === 0 ? Int32Array.of(4, 0, 0, 5) : new Int32Array()));
    const none = Array.from({ length: 20 }, () => undefined); // the 20 arguments between the saves and the cairns keep their defaults
    const Mode = OpenWorldMode as unknown as new (...args: unknown[]) => OpenWorldMode;
    const m = new Mode((_seed: number, cx: number, cy: number) => grass(cx, cy), () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), ...none, cairnsOf);
    m.enter(7, 800, 600);
    expect(cairnsOf).toHaveBeenCalledWith(7, 0, 0);
    expect(mesh(m.scene!, 'cairn').count).toBe(2);
    m.leave();
  });

  it('stands none when the bridge gives none', () => {
    const m = new OpenWorldMode((_seed, cx, cy) => grass(cx, cy), () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1));
    m.enter(7, 800, 600);
    expect(mesh(m.scene!, 'cairn').count).toBe(0);
    m.leave();
  });
});

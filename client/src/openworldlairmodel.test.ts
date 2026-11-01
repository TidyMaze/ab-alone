import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D } from './board';
import { CHUNK, World } from './openworld';
import { OpenWorldView, loadModels } from './openworldview';

// Grass at level 2 everywhere in the square -3..3 of chunks.
function flat(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}

describe('the Blender landmark of a boss lair (#1171)', () => {
  const lair = (view: OpenWorldView, i: number) => view.scene.getObjectByName(`lair-${i}`) as THREE.Group;
  const painted = (g: THREE.BoxGeometry) => {
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(0.5), 3));
    return g;
  };
  const heightOf = (group: THREE.Group) => ((group.children[0] as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.height;
  const withModels = () => {
    const view = new OpenWorldView(new World(flat));
    view.setLairs([[4, 1], [0, 3]], [1]);
    view.useModels({ low: { lair: painted(new THREE.BoxGeometry(1, 5, 1)), lair_beaten: painted(new THREE.BoxGeometry(1, 2, 1)) }, high: {} });
    return view;
  };

  it('swaps the plain pillars for the models once they are in: the open one for an unbeaten lair, the beaten one for a beaten lair', () => {
    const view = withModels();
    expect(lair(view, 0).children).toHaveLength(1);
    expect(heightOf(lair(view, 0))).toBe(5);
    expect(heightOf(lair(view, 1))).toBe(2);
    expect(((lair(view, 0).children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect(lair(view, 0).position.x).toBeCloseTo(axialTo3D(4, 1).x);
  });

  it('draws a later setLairs with the models too, and keeps the plain pillars when a model is missing', () => {
    const view = withModels();
    view.setLairs([[4, 1]], [0]);
    expect(heightOf(lair(view, 0))).toBe(2);
    const bare = new OpenWorldView(new World(flat));
    bare.setLairs([[4, 1]], []);
    bare.useModels({ low: { lair: painted(new THREE.BoxGeometry(1, 5, 1)) }, high: {} });
    expect(lair(bare, 0).children).toHaveLength(2);
  });

  it('loads the landmark file with the models, and keeps going when it fails', async () => {
    const scene = new THREE.Group();
    for (const name of ['ow_lair', 'ow_lair_beaten']) {
      const m = new THREE.Mesh(new THREE.BoxGeometry());
      m.name = name;
      scene.add(m);
    }
    const urls = { low: '/l.glb', high: '/h.glb', lair: '/lair.glb' };
    const loader = { loadAsync: vi.fn(async (url: string) => ({ scene: url === urls.lair ? scene : new THREE.Group() })) };
    const models = await loadModels(urls, loader);
    expect(Object.keys(models.low).sort()).toEqual(['lair', 'lair_beaten']);
    const failing = { loadAsync: async (url: string) => (url === urls.lair ? Promise.reject(new Error('404')) : { scene: new THREE.Group() }) };
    expect((await loadModels(urls, failing)).low).toEqual({});
  });
});

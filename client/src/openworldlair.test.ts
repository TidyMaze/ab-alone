import './test/openworldwasm';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D } from './board';
import { CHUNK, World } from './openworld';
import { GROUND, LAIR_LOOK, OpenWorldView, TOWER_CROWN, topOf } from './openworldview';

// Grass everywhere in the square -3..3 of chunks, at the level of the cell in `levels` or `base`.
function stepped(levels: Map<string, number>, base: number): (cx: number, cy: number) => Uint8Array {
  return (cx, cy) => {
    if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
    const out = new Uint8Array(CHUNK * CHUNK * 3);
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      const q = cx * CHUNK + (i % CHUNK);
      const r = cy * CHUNK + Math.floor(i / CHUNK);
      out.set([levels.get(`${q},${r}`) ?? base, 2, 0], i * 3);
    }
    return out;
  };
}

describe('the landmark of a boss lair (#1170)', () => {
  const lair = (view: OpenWorldView, i: number) => view.scene.getObjectByName(`lair-${i}`) as THREE.Group;
  const colourOf = (group: THREE.Group) => ((group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex();

  it('stands a pillar on the top of each lair cell, gold while the lair is unbeaten and green once beaten', () => {
    const view = new OpenWorldView(new World(stepped(new Map([['4,1', 5]]), 2)));
    view.setLairs([[4, 1], [0, 3]], [1]);
    const p = axialTo3D(4, 1);
    expect(lair(view, 0).position.x).toBeCloseTo(p.x);
    expect(lair(view, 0).position.z).toBeCloseTo(p.z);
    expect(lair(view, 0).position.y).toBeCloseTo(topOf(GROUND.grass, 5, 4, 1));
    expect(lair(view, 1).position.y).toBeCloseTo(topOf(GROUND.grass, 2, 0, 3));
    expect(colourOf(lair(view, 0))).toBe(LAIR_LOOK.open);
    expect(colourOf(lair(view, 1))).toBe(LAIR_LOOK.beaten);
  });

  it('replaces the landmarks of an earlier call, and frees them after the next draw', () => {
    const view = new OpenWorldView(new World(stepped(new Map(), 2)));
    view.setLairs([[4, 1], [0, 3]], []);
    const old = lair(view, 0).children[0] as THREE.Mesh;
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    view.setLairs([[4, 1]], [0]);
    expect(view.scene.getObjectByName('lair-1')).toBeUndefined();
    expect(colourOf(lair(view, 0))).toBe(LAIR_LOOK.beaten);
    expect(disposeGeometry.mock.contexts).not.toContain(old.geometry);
    view.drain();
    expect(disposeGeometry.mock.contexts).toContain(old.geometry);
    vi.restoreAllMocks();
  });
});

// #1518: the tower has a silhouette of its own, the crenellated crown of its map icon, in the lamp's colour, ringing the spire high up so
// it reads from the widest zoom; a beaten tower loses it (the shape changes, not only the colour). Under a hundred triangles a tower.
describe('the crown of a boss tower (#1518)', () => {
  const crown = (view: OpenWorldView, i: number) => view.scene.getObjectByName(`lair-${i}`)!.getObjectByName('lair-crown') as THREE.Mesh | undefined;
  const painted = (g: THREE.BoxGeometry) => g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(0.5), 3));

  it('crowns an unbeaten tower, plain or modelled, wider than the spire and high on it, and not a beaten one', () => {
    const view = new OpenWorldView(new World(stepped(new Map(), 2)));
    view.setLairs([[4, 1], [0, 3]], [1]);
    expect(crown(view, 1)).toBeUndefined();
    view.scene.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(crown(view, 0)!);
    expect(box.min.y - view.scene.getObjectByName('lair-0')!.position.y).toBeGreaterThan(TOWER_CROWN.height - 0.5);
    expect(box.max.x - box.min.x).toBeGreaterThan(2 * TOWER_CROWN.radius);
    expect((crown(view, 0)!.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(LAIR_LOOK.open);
    view.useModels({ low: { lair: painted(new THREE.BoxGeometry(1, 5, 1)), lair_beaten: painted(new THREE.BoxGeometry(1, 2, 1)) }, high: {} });
    expect(crown(view, 0)).toBeDefined();
    expect(crown(view, 1)).toBeUndefined();
  });

  it('is six merlons on a collar, under a hundred triangles', () => {
    const view = new OpenWorldView(new World(stepped(new Map(), 2)));
    view.setLairs([[4, 1]], []);
    const geometry = crown(view, 0)!.geometry;
    const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    expect(triangles).toBeGreaterThan(6 * 12);
    expect(triangles).toBeLessThanOrEqual(100);
  });
});

// #1571: the music follows the biome of the hero's cell (covered here since the view is touched by #1518).
describe('the biome of the hero (#1571)', () => {
  it('is the biome of the cell the hero stands on', () => {
    const world = new World(stepped(new Map(), 2));
    expect(new OpenWorldView(world).heroBiome).toBe(world.tile(0, 0)!.biome);
  });
});

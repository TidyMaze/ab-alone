import './test/openworldwasm';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D } from './board';
import { CHUNK, World } from './openworld';
import { GROUND, LAIR_LOOK, OpenWorldView, topOf } from './openworldview';

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

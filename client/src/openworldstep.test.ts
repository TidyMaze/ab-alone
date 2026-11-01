// @vitest-environment jsdom
import './test/openworldwasm';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, World } from './openworld';
import { DEFAULT_YAW, restYaw, TURN_STEP } from './openworldmode';
import { heroStep } from './openworldstep';
import { OpenWorldView } from './openworldview';

// The rules of the step are tested in Rust (abalone-core worldstep); this file tests what the client adds: the packing of the keys,
// the free cells and the answer, and the camera's yaw against what the screen shows.
const open = () => true;
// Grass at height 1 in the chunks round the origin.
const grass = () => Uint8Array.from({ length: CHUNK * CHUNK * 3 }, (_, i) => [1, 2, 0][i % 3]!);
const DEG = Math.PI / 180;

describe('heroStep', () => {
  it('gives the cell of the held arrows: a single arrow, a diagonal, with the row zigzag of up and down', () => {
    expect(heroStep([0, 0], ['ArrowRight'], 0, false, open)).toEqual([1, 0]);
    expect(heroStep([0, 0], ['ArrowLeft'], 0, false, open)).toEqual([-1, 0]);
    expect(heroStep([0, 0], ['ArrowUp'], 0, false, open)).toEqual([1, -1]);
    expect(heroStep([0, 1], ['ArrowUp'], 0, false, open)).toEqual([0, 0]);
    expect(heroStep([0, 0], new Set(['ArrowDown', 'ArrowLeft']), 0, false, open)).toEqual([-1, 1]);
  });

  it('gives nothing for no arrow, for other keys, or for opposite arrows', () => {
    expect(heroStep([0, 0], [], 0.5, true, open)).toBeNull();
    expect(heroStep([0, 0], ['a'], 0.5, true, open)).toBeNull();
    expect(heroStep([0, 0], ['ArrowUp', 'ArrowDown'], 0.5, true, open)).toBeNull();
  });

  it('asks which cells are free only when steering, and slides round a shut one', () => {
    const free = vi.fn(([q, r]: Axial) => !(q === 1 && r === 0));
    expect(heroStep([0, 0], ['ArrowRight'], 0, false, free)).toEqual([1, 0]);
    expect(free).not.toHaveBeenCalled();
    expect(heroStep([0, 0], ['ArrowRight'], 0, true, free)).toEqual([1, -1]);
    expect(free).toHaveBeenCalledTimes(6);
    expect(heroStep([0, 0], ['ArrowRight'], 0, true, () => false)).toEqual([1, 0]); // a dead end: the blocked cell, the hero leans
  });

  it('up alone walks a straight line of hexes at each of the 6 resting angles, from an even or an odd row (#1254)', () => {
    for (let k = 0; k < 6; k++) {
      const yaw = restYaw(DEFAULT_YAW + k * TURN_STEP);
      for (const start of [[0, 0], [0, 1]] as Axial[]) {
        let at = start;
        const first = heroStep(at, ['ArrowUp'], yaw, false, open)!;
        const dir = [first[0] - at[0], first[1] - at[1]];
        for (let i = 0; i < 6; i++) {
          const next = heroStep(at, ['ArrowUp'], yaw, false, open)!;
          expect([next[0] - at[0], next[1] - at[1]]).toEqual(dir);
          at = next;
        }
      }
    }
  });

  it('rolls the hero to the cell the camera shows in the direction of each key, at each yaw (#1026)', () => {
    const world = new World((cx, cy) => (Math.abs(cx) > 3 || Math.abs(cy) > 3 ? new Uint8Array() : grass()));
    const keysets = [['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'], ['ArrowUp', 'ArrowLeft'], ['ArrowUp', 'ArrowRight'], ['ArrowDown', 'ArrowLeft'], ['ArrowDown', 'ArrowRight']];
    const vector: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const angleOf = (keys: string[]) => {
      const [x, y] = keys.reduce(([sx, sy], k) => [sx + vector[k]![0], sy + vector[k]![1]], [0, 0]);
      return Math.atan2(y, x) / DEG;
    };
    const gap = (a: number, b: number) => {
      const d = (((a - b) % 360) + 360) % 360;
      return Math.min(d, 360 - d);
    };
    for (const yaw of [15, 30, 45, 60, 90, 120, 135, 180, -30, -60, -70].map((d) => d * DEG)) {
      const view = new OpenWorldView(world);
      view.resize(1600, 900);
      view.turnTo(yaw);
      view.show([0, 0]);
      const onScreen = (cell: Axial) => {
        const p = axialTo3D(cell[0], cell[1]);
        return new THREE.Vector3(p.x, 0, p.z).project(view.camera);
      };
      const from = onScreen([0, 0]);
      for (const keys of keysets) {
        const there = onScreen(heroStep([0, 0], keys, yaw, false, open)!);
        // The neighbours are 60 degrees apart, so the nearest lies within 30 degrees of the key on the ground, and the perspective
        // bends the screen angle by some ten degrees more. A sign error would miss by 60 or more.
        expect(gap(Math.atan2(there.y - from.y, there.x - from.x) / DEG, angleOf(keys))).toBeLessThanOrEqual(45);
      }
    }
  });
});

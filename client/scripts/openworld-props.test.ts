import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { mountain, regenerate, tree, withProps } from './openworld-props.mjs';

// The Open world's mountain and tree (#1557): generated shapes that read apart from far away, written into the two prop models.
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../models/${file}`, import.meta.url)));

/** The triangles of a flat geometry: 9 position floats each. */
const faces = (g: { positions: Float32Array }) => g.positions.length / 9;
const ys = (g: { positions: Float32Array }) => Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions[i * 3 + 1]!);
const tones = (g: { colours: Uint16Array }) => new Set(Array.from({ length: g.colours.length / 4 }, (_, i) => g.colours[i * 4]).map(String)).size;

describe('the mountain', () => {
  const g = mountain();

  it('is a two-level peak: 18 flat triangles, on its base at -0.5 and its summit at 0.5', () => {
    expect(faces(g)).toBe(18);
    expect(Math.min(...ys(g))).toBeCloseTo(-0.5, 5);
    expect(Math.max(...ys(g))).toBeCloseTo(0.5, 5);
  });

  it('stays inside the box the view lays it in (the mountain of #1160)', () => {
    const xs = Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions[i * 3]!);
    const zs = Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions[i * 3 + 2]!);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(0.55);
    expect(Math.max(...zs.map(Math.abs))).toBeLessThanOrEqual(0.46);
  });

  it('is painted in three flat tones, dark base, slate middle, pale summit', () => {
    expect(tones(g)).toBe(3);
  });

  it('points every face away from its axis', () => {
    for (let f = 0; f < faces(g); f++) {
      const n = g.normals.subarray(f * 9, f * 9 + 3);
      const x = g.positions[f * 9]! + g.positions[f * 9 + 3]! + g.positions[f * 9 + 6]!;
      const z = g.positions[f * 9 + 2]! + g.positions[f * 9 + 5]! + g.positions[f * 9 + 8]!;
      expect(n[0]! * x + n[2]! * z).toBeGreaterThan(0);
    }
  });
});

describe('the tree', () => {
  it('is a three-tier pine: 18 triangles at 6 sides, 24 at 8, on its base at -0.5 and its tip at 0.5', () => {
    expect(faces(tree(6))).toBe(18);
    expect(faces(tree(8))).toBe(24);
    expect(Math.min(...ys(tree(6)))).toBeCloseTo(-0.5, 5);
    expect(Math.max(...ys(tree(6)))).toBeCloseTo(0.5, 5);
  });

  it('is painted in two tones, a dark skirt and a bright tip, and points every face away from its axis', () => {
    const g = tree(8);
    expect(tones(g)).toBe(2);
    for (let f = 0; f < faces(g); f++) {
      const n = g.normals.subarray(f * 9, f * 9 + 3);
      const x = g.positions[f * 9]! + g.positions[f * 9 + 3]! + g.positions[f * 9 + 6]!;
      const z = g.positions[f * 9 + 2]! + g.positions[f * 9 + 5]! + g.positions[f * 9 + 8]!;
      expect(n[0]! * x + n[2]! * z).toBeGreaterThan(0);
    }
  });
});

describe('the generated models', () => {
  const low = read('openworld.glb');

  it('keep the boulder and the wall byte for byte, and redo only the mountain and the tree', () => {
    const out = withProps(low, { mountain: 6, tree: 6 });
    expect(out.subarray(0, 4).toString()).toBe('glTF');
    // the first and the last mesh (the boulder and the wall) read the same vertex and index bytes in both files
    const bytes = (glb: Buffer, mesh: number) => {
      const headerLen = glb.readUInt32LE(12);
      const doc = JSON.parse(glb.subarray(20, 20 + headerLen).toString());
      const bin = glb.subarray(28 + headerLen);
      const primitive = doc.meshes[mesh].primitives[0];
      const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>;
      return [primitive.indices, ...Object.values(primitive.attributes as Record<string, number>)].map((index) => {
        const acc = doc.accessors[index];
        const start = (doc.bufferViews[acc.bufferView].byteOffset ?? 0) + (acc.byteOffset ?? 0);
        const width = { 5123: 2, 5126: 4 } as Record<number, number>;
        return bin.subarray(start, start + acc.count * size[acc.type]! * width[acc.componentType]!).toString('hex');
      });
    };
    expect(bytes(out, 0)).toEqual(bytes(low, 0));
    expect(bytes(out, 3)).toEqual(bytes(low, 3));
    expect(withProps(out, { mountain: 6, tree: 6 })).toEqual(out);
  });

  it('are the committed models: running the generator again changes no byte', () => {
    expect(read('openworld.glb')).toEqual(withProps(read('openworld.glb'), { mountain: 6, tree: 6 }));
    expect(read('openworld-hi.glb')).toEqual(withProps(read('openworld-hi.glb'), { mountain: 6, tree: 8 }));
  });

  it('rewrites both models in a folder, and the committed ones come out the same', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ow-props-'));
    for (const file of ['openworld.glb', 'openworld-hi.glb']) copyFileSync(fileURLToPath(new URL(`../models/${file}`, import.meta.url)), join(dir, file));
    regenerate(pathToFileURL(`${dir}/`));
    for (const file of ['openworld.glb', 'openworld-hi.glb']) expect(readFileSync(join(dir, file))).toEqual(read(file));
  });
});

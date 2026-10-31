import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Open world props (#1138): the tree and the boulder are vertex-coloured meshes, no texture, under the art budget, with the node
// names the view looks them up by (openworldview.ts `readModels`). The mountain and the wall are clean low-poly models (#1160): a
// few big flat planes in two to four flat tones, under a triangle budget, in the box the view lays them in.
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../models/${file}`, import.meta.url)));
const json = (data: Buffer) =>
  JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString()) as {
    nodes: { name: string; mesh: number }[];
    meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
    accessors: { count: number; min?: number[]; max?: number[]; bufferView: number; byteOffset?: number; componentType: number }[];
    bufferViews: { byteOffset?: number }[];
    images?: unknown[];
  };

/** The triangle budget of the clean props (#1160): the mountain is two peaks of 9 to 12 triangles, the wall a bevelled block. */
const BUDGET = { mountain: 24, wall: 60 } as const;
/** The box the view lays each prop in (openworldview.ts `lay`): the old models' boxes, within a hair. */
const BOX = {
  mountain: { min: [-0.55, -0.5, -0.45], max: [0.55, 0.5, 0.46] },
  wall: { min: [-0.434, -0.5, -0.5], max: [0.434, 0.5, 0.5] },
} as const;

describe.each([
  ['openworld.glb', ''],
  ['openworld-hi.glb', '_hi'],
])('%s', (file, suffix) => {
  const data = read(file);
  const model = json(data);
  const node = (prop: string) => model.nodes.find((n) => n.name === `ow_${prop}${suffix}`)!;
  const primitive = (prop: string) => model.meshes[node(prop).mesh]!.primitives[0]!;
  const faces = (prop: string) => model.accessors[primitive(prop).indices]!.count / 3;

  it('holds the four props under the names the view reads, each with vertex colours and no texture', () => {
    for (const prop of ['mountain', 'tree', 'boulder', 'wall']) {
      expect(node(prop), prop).toBeDefined();
      expect(primitive(prop).attributes, prop).toHaveProperty('COLOR_0');
    }
    expect(model.images ?? []).toEqual([]);
  });

  it('draws the boulder as 6 to 8 flat facets and the tree as a few cone facets', () => {
    expect(faces('boulder')).toBeGreaterThanOrEqual(6);
    expect(faces('boulder')).toBeLessThanOrEqual(8);
    expect(faces('tree')).toBeLessThan(100);
  });

  it('draws the mountain and the wall as few big planes, under their triangle and vertex budgets', () => {
    for (const prop of ['mountain', 'wall'] as const) {
      expect(faces(prop), prop).toBeGreaterThanOrEqual(8);
      expect(faces(prop), prop).toBeLessThanOrEqual(BUDGET[prop]);
      // flat shading: at most three vertices of its own per triangle
      expect(model.accessors[primitive(prop).attributes.POSITION!]!.count, prop).toBeLessThanOrEqual(faces(prop) * 3);
    }
  });

  it('keeps the box, the origin and the unit scale the view lays the mountain and the wall in', () => {
    for (const prop of ['mountain', 'wall'] as const) {
      const { min, max } = model.accessors[primitive(prop).attributes.POSITION!]!;
      for (let axis = 0; axis < 3; axis++) {
        expect(min![axis]!, `${prop} min ${axis}`).toBeGreaterThanOrEqual(BOX[prop].min[axis]!);
        expect(max![axis]!, `${prop} max ${axis}`).toBeLessThanOrEqual(BOX[prop].max[axis]!);
      }
      expect(min![1], `${prop} sits on its base`).toBeCloseTo(-0.5, 2);
      expect(max![1], `${prop} reaches its top`).toBeCloseTo(0.5, 2);
      expect(node(prop), prop).not.toHaveProperty('scale');
      expect(node(prop), prop).not.toHaveProperty('translation');
    }
  });

  it('paints the mountain and the wall in two to four flat tones, no noise', () => {
    // the vertex colours are normalised unsigned shorts (Blender's export)
    const rgba = (accessor: number) => {
      const a = model.accessors[accessor]!;
      expect(a.componentType).toBe(5123);
      const start = 20 + data.readUInt32LE(12) + 8 + (model.bufferViews[a.bufferView]!.byteOffset ?? 0) + (a.byteOffset ?? 0);
      return Array.from({ length: a.count * 4 }, (_, i) => data.readUInt16LE(start + i * 2) / 65535);
    };
    for (const prop of ['mountain', 'wall'] as const) {
      const colours = new Set<string>();
      const values = rgba(primitive(prop).attributes.COLOR_0!);
      for (let i = 0; i < values.length; i += 4) colours.add(values.slice(i, i + 3).map((c) => c.toFixed(2)).join(','));
      expect(colours.size, prop).toBeGreaterThanOrEqual(2);
      expect(colours.size, prop).toBeLessThanOrEqual(4);
    }
  });

  it('stays within the art budget of a prop file: under 20 KB', () => {
    expect(statSync(fileURLToPath(new URL(`../models/${file}`, import.meta.url))).size).toBeLessThan(20_000);
  });
});

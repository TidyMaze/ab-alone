import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Open world props (#1138): the tree and the boulder are vertex-coloured meshes, no texture, under the art budget, with the node
// names the view looks them up by (openworldview.ts `readModels`).
const json = (file: string) => {
  const data = readFileSync(fileURLToPath(new URL(`../models/${file}`, import.meta.url)));
  return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString()) as {
    nodes: { name: string; mesh: number }[];
    meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
    accessors: { count: number }[];
    images?: unknown[];
  };
};

describe.each([
  ['openworld.glb', ''],
  ['openworld-hi.glb', '_hi'],
])('%s', (file, suffix) => {
  const model = json(file);
  const node = (prop: string) => model.nodes.find((n) => n.name === `ow_${prop}${suffix}`)!;

  it('holds the four props under the names the view reads, each with vertex colours and no texture', () => {
    for (const prop of ['mountain', 'tree', 'boulder', 'wall']) {
      expect(node(prop), prop).toBeDefined();
      expect(model.meshes[node(prop).mesh]!.primitives[0]!.attributes, prop).toHaveProperty('COLOR_0');
    }
    expect(model.images ?? []).toEqual([]);
  });

  it('draws the boulder as 6 to 8 flat facets and the tree as a few cone facets', () => {
    const faces = (prop: string) => model.accessors[model.meshes[node(prop).mesh]!.primitives[0]!.indices]!.count / 3;
    expect(faces('boulder')).toBeGreaterThanOrEqual(6);
    expect(faces('boulder')).toBeLessThanOrEqual(8);
    expect(faces('tree')).toBeLessThan(100);
  });

  it('stays within the art budget of a prop file (1 MB)', () => {
    expect(statSync(fileURLToPath(new URL(`../models/${file}`, import.meta.url))).size).toBeLessThan(1_000_000);
  });
});
